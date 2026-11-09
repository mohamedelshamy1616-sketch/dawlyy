import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, lstat, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { conflict, forbidden, notFound, unprocessable, validationError } from '../../api/errors';

/** T3b / §12.1(18): storage instructions; callers never receive service credentials. */
export interface StorageProvider {
  createUpload(path: string, contentType: string, maxBytes: number): Promise<{ url: string; method: string; headers?: Record<string, string> }>;
  createDownload(path: string, ttlSec: number): Promise<{ url: string }>;
  remove(path: string): Promise<void>;
}

const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const storageShape = new RegExp(`^(${uuid})/(?:assets/|clients/${uuid}/)[A-Za-z0-9._/-]+$`);
const proofTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
/** T3b: maximum proof object size in bytes. */
export const MAX_PROOF_BYTES = 8 * 1024 * 1024;

/** T3b: enforce the database's tenant/client path shape before filesystem or remote storage access. */
export function validateStoragePath(value: string, tenantId?: string): string {
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes('\\') || value.includes('//')
    || value.split('/').some((part) => part === '.' || part === '..' || part === '')
    || !storageShape.test(value) || (tenantId !== undefined && !value.startsWith(`${tenantId}/`))) throw validationError(undefined, 'Unsafe storage path');
  return value;
}

/** T3b: payment-proof MIME allowlist and eight MiB size ceiling. */
export function validateProof(contentType: string, sizeBytes: number): string {
  const extension = Object.hasOwn(proofTypes, contentType) ? proofTypes[contentType] : undefined;
  if (!extension || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_PROOF_BYTES) throw validationError(undefined, 'Invalid payment proof type or size');
  return extension;
}

const capability = z.object({ path: z.string(), purpose: z.enum(['upload', 'download']), expires: z.number().int(),
  contentType: z.string().optional(), maxBytes: z.number().int().optional() }).strict();
type Capability = z.infer<typeof capability>;
const localGlobal = globalThis as unknown as { __dawlyyStorageSecret?: Buffer };
function remoteStorage(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
}

/** T3b: development filesystem storage; signed short-lived capabilities bind path, type and size. */
export class LocalFsStorage implements StorageProvider {
  private readonly root = path.resolve(process.cwd(), process.cwd().replaceAll('\\', '/').endsWith('/apps/web') ? '../../.work/storage' : '.work/storage');
  private readonly secret = localGlobal.__dawlyyStorageSecret ??= randomBytes(32);

  private sign(value: Capability): string {
    const body = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${body}.${createHmac('sha256', this.secret).update(body).digest('base64url')}`;
  }

  /** T3b: authenticate a local capability before its path is read or written. */
  decode(token: string, purpose: Capability['purpose'], tenantId: string): Capability {
    try {
      const [body, sig, extra] = token.split('.');
      if (!body || !sig || extra !== undefined) throw new Error('Invalid token');
      const expected = createHmac('sha256', this.secret).update(body).digest();
      const actual = Buffer.from(sig, 'base64url');
      if (actual.toString('base64url') !== sig || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid signature');
      const record = capability.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown);
      if (record.purpose !== purpose || record.expires <= Date.now()) throw new Error('Expired token');
      validateStoragePath(record.path, tenantId);
      return record;
    } catch { throw forbidden('invalid_storage_token', 'Invalid or expired storage token'); }
  }

  private async target(value: string): Promise<string> {
    validateStoragePath(value);
    const target = path.resolve(this.root, value);
    if (!target.startsWith(this.root + path.sep)) throw validationError(undefined, 'Unsafe storage path');
    // Refuse symlinks/junctions, including pre-existing parents of the storage root.
    const parsed = path.parse(target);
    const parts = target.slice(parsed.root.length).split(path.sep);
    let current = parsed.root;
    for (const part of parts) {
      current = path.join(current, part);
      try { if ((await lstat(current)).isSymbolicLink()) throw validationError(undefined, 'Storage symlinks are not allowed'); }
      catch (error) { if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error; }
    }
    return target;
  }

  /** T3b: local capabilities expire in fifteen minutes and cannot overwrite an existing proof. */
  async createUpload(value: string, contentType: string, maxBytes: number) {
    validateStoragePath(value); validateProof(contentType, maxBytes);
    const token = this.sign({ path: value, purpose: 'upload', expires: Date.now() + 900000, contentType, maxBytes });
    return { url: `/api/v1/media/local-upload/${token}`, method: 'PUT', headers: { 'Content-Type': contentType } };
  }

  /** T3b: local downloads are authenticated again by the media router. */
  async createDownload(value: string, ttlSec: number) {
    validateStoragePath(value);
    if (!Number.isInteger(ttlSec) || ttlSec < 1 || ttlSec > 900) throw validationError();
    return { url: `/api/v1/media/local-download/${this.sign({ path: value, purpose: 'download', expires: Date.now() + ttlSec * 1000 })}` };
  }

  /** T3b: receive only bytes matching the server-issued size/type envelope. */
  async receive(token: string, tenantId: string, contentType: string, bytes: Uint8Array): Promise<string> {
    const record = this.decode(token, 'upload', tenantId);
    if (record.contentType !== contentType || record.maxBytes === undefined || bytes.byteLength < 1 || bytes.byteLength > record.maxBytes) throw validationError(undefined, 'Upload differs from its signed instruction');
    const target = await this.target(record.path);
    await mkdir(path.dirname(target), { recursive: true });
    await this.target(record.path);
    try { await writeFile(target, bytes, { flag: 'wx' }); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') throw conflict('Proof is already uploaded');
      throw error;
    }
    return record.path;
  }

  /** T3b: open only a signed, tenant-validated local download. */
  async read(token: string, tenantId: string): Promise<Uint8Array> {
    const record = this.decode(token, 'download', tenantId);
    try { return new Uint8Array(await readFile(await this.target(record.path))); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') throw notFound('Proof has not been uploaded');
      throw error;
    }
  }

  /** T3b: scoped object removal; an absent object is already removed. */
  async remove(value: string) {
    try { await unlink(await this.target(value)); }
    catch (error) { if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
}

/** T3b: Supabase signed-upload adapter, checked against installed createSignedUploadUrl JSDoc; untested against a live bucket here. */
export class SupabaseStorage implements StorageProvider {
  private readonly storage: ReturnType<typeof remoteStorage>;
  /** T3b: server-only constructor; credentials must never enter a client component. */
  constructor(url: string, key: string) { this.storage = remoteStorage(url, key); }
  private bucket(value: string) { validateStoragePath(value); return this.storage.from(value.split('/')[1] === 'assets' ? 'tenant-assets' : 'client-media'); }
  /** T3b: signed uploads use PUT, no upsert, and the exact path issued after the RLS insert. */
  async createUpload(value: string, contentType: string, maxBytes: number) {
    validateProof(contentType, maxBytes);
    // Signed-upload API has no per-token size/MIME limits. Configure client-media bucket to enforce 8 MiB and this MIME allowlist.
    const { data, error } = await this.bucket(value).createSignedUploadUrl(value, { upsert: false });
    if (error || !data) throw new Error('Could not create upload instruction');
    return { url: data.signedUrl, method: 'PUT', headers: { 'Content-Type': contentType } };
  }
  /** T3b: downloads have a short expiry and are requested only after an RLS read. */
  async createDownload(value: string, ttlSec: number) {
    if (!Number.isInteger(ttlSec) || ttlSec < 1 || ttlSec > 900) throw validationError();
    const { data, error } = await this.bucket(value).createSignedUrl(value, ttlSec);
    if (error || !data) throw notFound();
    return { url: data.signedUrl };
  }
  /** T3b: remove an exact path from its derived bucket. */
  async remove(value: string) {
    const { error } = await this.bucket(value).remove([value]);
    if (error) throw new Error('Could not remove stored object');
  }
}

/** T3b: select Supabase only when both credentials exist; local provider is for development. */
export function getStorage(): StorageProvider {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return new SupabaseStorage(url, key);
  if (process.env.NODE_ENV === 'production') throw unprocessable('storage_unavailable', 'Storage is not configured');
  return new LocalFsStorage();
}
