import type { Action } from '@dawlyy/core/authz';
import type { AuthContext } from '../db';
import { requirePermission } from '../require-permission';
import { forbidden } from '../../api/errors';

/** T3b: coach-only billing boundary; core intentionally also grants client-facing billing view/create. */
export function requireBillingPermission(auth: AuthContext, action: Action): void {
  if (auth.role === 'client') throw forbidden();
  requirePermission(auth, 'billing', action);
}
