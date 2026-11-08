import { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiEnv } from './env';

// Task 4: exercise library.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>();
