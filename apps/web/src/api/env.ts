import type { AuthVariables } from './middleware/auth';
import type { IdempotencyVariables } from './middleware/idempotency';

/** doc §12.1 / build-plan API: shared authenticated context and optional idempotency key for every router. */
export type ApiEnv = { Variables: AuthVariables & IdempotencyVariables & { requestId?: string } };
