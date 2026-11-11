import { and, eq } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { clients } from '@dawlyy/db/schema';
import type { AuthContext, Tx } from '../db';
import { forbidden, notFound, validationError } from '../../api/errors';
import { requirePermission } from '../require-permission';

/** Task 8 / §12.1: resolve ownership before queries; staff also need the tracking grant. */
export function trackingClient(auth: AuthContext, clientId?: string, action: 'view' | 'create' | 'edit' | 'delete' = 'view'): string {
  if (auth.role === 'client') {
    if (!auth.clientId || (clientId && clientId !== auth.clientId)) throw forbidden();
    requirePermission(auth, 'tracking', action === 'delete' ? 'edit' : action);
    return auth.clientId;
  }
  requirePermission(auth, 'tracking', action);
  if (!clientId) throw validationError(undefined, 'clientId is required');
  return clientId;
}

/** Task 8: visibility and serialization lock shared by cadence and entry writes. */
export async function visibleClient(tx: Tx, auth: AuthContext, clientId: string, lock = false) {
  const query = tx.select({ id: clientColumns.clients.id, timezone: clientColumns.clients.timezone, startedOn: clientColumns.clients.startedOn }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, clientId))).limit(1);
  const [client] = await (lock ? query.for('update') : query);
  if (!client) throw notFound();
  return client;
}
