import 'server-only';
import { isAllowed, type Action, type Module } from '@dawlyy/core/authz';
import type { AuthContext } from '@dawlyy/db';
import { forbidden } from '../api/errors';

/** doc §12.1: enforce the core module/action grants without a query; RLS enforces row scope. */
export function requirePermission(ctx: AuthContext, module: Module, action: Action): void {
  if (!isAllowed(ctx, module, action)) throw forbidden();
}
