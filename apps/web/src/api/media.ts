import { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiEnv } from './env';

// Tasks 8/9/11 consume media; the build plan leaves this router without an implementation owner.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>();
