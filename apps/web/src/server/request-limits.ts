/** Shared byte ceilings for transport and media validation. */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;
export const MAX_PROOF_BYTES = 8 * 1024 * 1024;

/** P7 D3: finite ISO timestamp contract (including offset and fractional seconds). */
export const MAX_SYNC_TIMESTAMP_CHARS = 64;
/** P7 D3: the CSV schema's UTF-8 ceiling, before JSON escaping. */
export const MAX_CSV_BYTES = 1024 * 1024;
/** P7 D3: schema counts shared with the byte-bounded outbox. */
export const MAX_SYNC_SESSIONS = 100;
/** P7 D3: schema counts shared with the byte-bounded outbox. */
export const MAX_SYNC_SETS = 1000;
// JSON escapes cost at most six bytes per UTF-16 unit. A full session has
// 6,200 note/mood units plus bounded IDs, timezone and timestamps (<48 KiB);
// a full set has 4,000 note units plus bounded IDs/timestamps (<32 KiB).
// These allowances also cover all property names, numeric values and commas.
/** P7 D3: covers 100 maximum sessions and 1,000 maximum sets plus their envelope. */
export const MAX_WORKOUT_SYNC_BODY_BYTES = 1024 + MAX_SYNC_SESSIONS * 48 * 1024 + MAX_SYNC_SETS * 32 * 1024;
/** P7 D3: sixfold CSV escaping plus the bounded mapping and commit options. */
export const MAX_CSV_IMPORT_BODY_BYTES = 6 * MAX_CSV_BYTES + 4096;
/** P7 D3: small foreground uploads, always below the server sync ceiling. */
export const MAX_OUTBOX_BATCH_BYTES = MAX_JSON_BODY_BYTES;

/** P7 D3 / N4: route-specific transport ceilings, checked before buffering. */
export function requestBodyLimit(method: string, path: string): number {
  if (method === 'POST' && /^\/api\/v1\/workout-sessions\/sync\/?$/.test(path)) return MAX_WORKOUT_SYNC_BODY_BYTES;
  if (method === 'POST' && /^\/api\/v1\/exercises\/import\/(preview|commit)\/?$/.test(path)) return MAX_CSV_IMPORT_BODY_BYTES;
  return method === 'PUT' && /^\/api\/v1\/media\/local-upload\/[^/]+\/?$/.test(path)
    ? MAX_PROOF_BYTES : MAX_JSON_BODY_BYTES;
}
