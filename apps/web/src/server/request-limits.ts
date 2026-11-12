/** Shared byte ceilings for transport and media validation. */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;
export const MAX_PROOF_BYTES = 8 * 1024 * 1024;

export function requestBodyLimit(method: string, path: string): number {
  return method === 'PUT' && /^\/api\/v1\/media\/local-upload\/[^/]+\/?$/.test(path)
    ? MAX_PROOF_BYTES : MAX_JSON_BODY_BYTES;
}
