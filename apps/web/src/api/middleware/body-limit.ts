import type { Context } from 'hono';
import { requestBodyLimit } from '../../server/request-limits';
import { ApiError } from '../errors';

const bodies = new WeakMap<Request, Uint8Array<ArrayBuffer>>();
const tooLarge = () => new ApiError(413, 'payload_too_large', 'Request body exceeds the byte limit');

/** Consume the original stream with a byte ceiling before any tee, clone, or parser can buffer it. */
export async function readLimitedBody(c: Context): Promise<Uint8Array<ArrayBuffer>> {
  const request = c.req.raw;
  const cached = bodies.get(request);
  if (cached) return cached;
  const limit = requestBodyLimit(c.req.method, c.req.path);
  const declared = c.req.header('Content-Length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
    // Do not wait on a remote source's cancellation hook to reject its oversized declaration.
    void request.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > limit) {
          void reader.cancel().catch(() => {});
          throw tooLarge();
        }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  // Parsers/handlers receive an identical, bounded body; replay hashes the same exact bytes.
  if (request.body) c.req.raw = new Request(request, { body: bytes });
  bodies.set(c.req.raw, bytes);
  return bytes;
}
