/** Extract SQLSTATE without passing any error object or private query text to a logger. */
export function safeErrorMetadata(error: Error, requestId: string, route: string, status: number) {
  let code: string | null = null;
  let nested: unknown = error;
  for (let depth = 0; depth < 6 && nested && typeof nested === 'object'; depth++) {
    const fields = nested as { code?: unknown; cause?: unknown };
    if (typeof fields.code === 'string' && /^[0-9A-Z]{5}$/.test(fields.code)) { code = fields.code; break; }
    nested = fields.cause;
  }
  const name = /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) ? error.name : 'Error';
  return { name, code, requestId, route, status };
}
