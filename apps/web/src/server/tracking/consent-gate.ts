import { and, desc, eq } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { consents } from '@dawlyy/db/schema';
import type { AuthContext, Tx } from '../db';
import { forbidden } from '../../api/errors';

/** Task 8: the newest photos consent must be accepted and not withdrawn; an older acceptance never wins. */
export async function requirePhotoConsent(tx: Tx, auth: AuthContext): Promise<void> {
  if (auth.role !== 'client') return;
  const [consent] = await tx.select({ accepted: clientColumns.consents.accepted, withdrawnAt: clientColumns.consents.withdrawnAt }).from(consents)
    .where(and(eq(consents.tenantId, auth.tenantId), eq(consents.userId, auth.userId), eq(consents.kind, 'photos')))
    .orderBy(desc(consents.acceptedAt), desc(consents.id)).limit(1);
  if (!consent?.accepted || consent.withdrawnAt !== null) throw forbidden('consent_required', 'Active photos consent is required');
}
