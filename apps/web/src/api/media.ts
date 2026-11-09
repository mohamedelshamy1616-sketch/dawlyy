import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { randomUUID } from 'node:crypto';
import { media, clients } from '@dawlyy/db/schema';
import { clientColumns } from '@dawlyy/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { notFound, validationError } from './errors';
import { withAuthTx } from '../server/db';
import { billingErrorHandler } from '../server/subscriptions/http';
import { requirePermission } from '../server/require-permission';
import { requireBillingPermission } from '../server/payments/permission';
import { getStorage, LocalFsStorage, validateProof, MAX_PROOF_BYTES } from '../server/storage';
import { errors, jsonResult, idParams } from '../server/subscriptions/contracts';

// T3b owns payment proof; T8 extends this router with photo/review workflows.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(billingErrorHandler);
router.use('*', requireAuthMiddleware);
router.use('*', async (c, next) => {
  if (c.req.method === 'POST' || c.req.method === 'PUT') requireBillingPermission(c.get('auth'), 'create');
  await next();
});
router.use('*', idempotentReplay);

// Payment proof; photo and review workflows belong to T8.
const uploadInput = z.object({ clientId: z.uuid(), purpose: z.literal('payment_proof'),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  sizeBytes: z.number().int().min(1).max(MAX_PROOF_BYTES), filename: z.string().trim().min(1).max(255) }).strict();

router.openapi(createRoute({ method: 'post', path: '/uploads', request: { body: { required: true, content: { 'application/json': { schema: uploadInput } } } }, responses: { 201: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth'); requireBillingPermission(auth, 'create');
  const storage = getStorage();
  const input = c.req.valid('json');
  const extension = validateProof(input.contentType, input.sizeBytes);
  const value = `${auth.tenantId}/clients/${input.clientId}/payments/${randomUUID()}.${extension}`;
  const row = await withAuthTx(auth, async (tx) => {
    const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, input.clientId))).limit(1);
    if (!client) throw notFound();
    const [inserted] = await tx.insert(media).values({ tenantId: auth.tenantId, clientId: client.id, ownerUserId: auth.userId,
      bucket: 'client-media', path: value, kind: input.contentType === 'application/pdf' ? 'file' : 'photo',
      purpose: 'payment_proof', mimeType: input.contentType, bytes: input.sizeBytes }).returning({ id: media.id });
    if (!inserted) throw notFound();
    return inserted;
  });
  const upload = await storage.createUpload(value, input.contentType, input.sizeBytes);
  return c.json({ mediaId: row.id, upload }, 201);
});

router.openapi(createRoute({ method: 'get', path: '/{id}/url', request: { params: idParams }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  if (auth.role !== 'client') requirePermission(auth, 'billing', 'view');
  const row = await withAuthTx(auth, async (tx) => {
    const [found] = await tx.select({ path: clientColumns.media.path }).from(media)
      .where(and(eq(media.tenantId, auth.tenantId), eq(media.id, c.req.valid('param').id), isNull(media.deletedAt))).limit(1);
    if (!found) throw notFound();
    return found;
  });
  return c.json(await getStorage().createDownload(row.path, 300), 200);
});

// Local development transport. Both signed capabilities and the current caller's RLS visibility are checked.
const tokenParams = z.object({ token: z.string().min(1).max(4096) });
const binaryProof = { schema: z.string().openapi({ format: 'binary' }) };
router.openapi(createRoute({ method: 'put', path: '/local-upload/{token}', request: { params: tokenParams, body: { required: true, content: {
  'image/jpeg': binaryProof, 'image/png': binaryProof, 'image/webp': binaryProof, 'application/pdf': binaryProof,
} } }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  if (process.env.NODE_ENV === 'production') throw notFound();
  const storage = getStorage();
  if (!(storage instanceof LocalFsStorage)) throw notFound();
  const auth = c.get('auth'); requireBillingPermission(auth, 'create');
  const token = c.req.valid('param').token;
  const signed = storage.decode(token, 'upload', auth.tenantId);
  const row = await withAuthTx(auth, async (tx) => {
    const [found] = await tx.select({ id: media.id, mimeType: media.mimeType }).from(media)
      .where(and(eq(media.tenantId, auth.tenantId), eq(media.path, signed.path), isNull(media.deletedAt))).limit(1);
    if (!found) throw notFound();
    return found;
  });
  const contentType = c.req.header('content-type') ?? '';
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw validationError();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > (signed.maxBytes ?? 0)) { await reader.cancel(); throw validationError(undefined, 'Upload exceeds signed size'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  await storage.receive(token, auth.tenantId, contentType, bytes);
  await withAuthTx(auth, async (tx) => {
    const [updated] = await tx.update(media).set({ bytes: length, uploadedAt: new Date() })
      .where(and(eq(media.tenantId, auth.tenantId), eq(media.id, row.id), isNull(media.deletedAt))).returning({ id: media.id });
    if (!updated) throw notFound();
    await tx.execute(sql`select app.emit_event('media.uploaded', 'media', ${row.id})`);
  });
  return c.json({ mediaId: row.id, uploaded: true }, 200);
});

router.openapi(createRoute({ method: 'get', path: '/local-download/{token}', request: { params: tokenParams }, responses: { 200: { description: 'Stored proof', content: { 'application/octet-stream': { schema: z.string() } } }, ...errors } }), async (c) => {
  if (process.env.NODE_ENV === 'production') throw notFound();
  const storage = getStorage();
  if (!(storage instanceof LocalFsStorage)) throw notFound();
  const auth = c.get('auth'); if (auth.role !== 'client') requirePermission(auth, 'billing', 'view');
  const token = c.req.valid('param').token;
  const signed = storage.decode(token, 'download', auth.tenantId);
  const row = await withAuthTx(auth, async (tx) => {
    const [found] = await tx.select({ mimeType: clientColumns.media.mimeType }).from(media)
      .where(and(eq(media.tenantId, auth.tenantId), eq(media.path, signed.path), isNull(media.deletedAt))).limit(1);
    if (!found) throw notFound(); return found;
  });
  return new Response(new Uint8Array(await storage.read(token, auth.tenantId)), { headers: { 'Content-Type': row.mimeType,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});
