/** R0c: unwrap Drizzle's database cause without exposing SQL or health data. */
export function postgresCode(error: unknown): string | undefined {
  for (let depth = 0; depth < 8 && error && typeof error === 'object'; depth++) {
    const cause = error as { code?: string; cause?: unknown };
    if (cause.code && /^[0-9A-Z]{5}$/.test(cause.code)) return cause.code;
    error = cause.cause;
  }
  return undefined;
}
