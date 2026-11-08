import { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiEnv } from './env';

// Task 3: package and entitlement management.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>();
