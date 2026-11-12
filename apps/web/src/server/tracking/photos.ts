import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { media, progressPhotoSets } from '@dawlyy/db/schema';
import type { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { conflict, forbidden, notFound, validationError } from '../../api/errors';
import { page } from '../../api/lib/pagination';
import { getStorage } from '../storage';
import { requirePermission } from '../require-permission';
import { trackingClient, visibleClient } from './access';
import { requirePhotoConsent } from './consent-gate';
import { listPosition, type EntryQuery } from './entries';
import { photoInput } from './contracts';
import { completeTrackingEvents, getCadence } from './client-read';

// The frozen set table has no deleted_at. A set is soft-deleted when all its media are soft-deleted.
const liveSet = sql`exists (select 1 from jsonb_array_elements(${progressPhotoSets.poses}) p join public.media m on m.id = (p->>'mediaId')::uuid where m.tenant_id = ${progressPhotoSets.tenantId} and m.client_id = ${progressPhotoSets.clientId} and m.purpose = 'progress_photo' and m.deleted_at is null)`;
async function signSet(tx: Tx, auth: AuthContext, row: typeof progressPhotoSets.$inferSelect) {
  const poses = [];
  for (const pose of row.poses) {
    const [asset] = await tx.select({ path: clientColumns.media.path }).from(media).where(and(eq(media.tenantId, auth.tenantId), eq(media.clientId, row.clientId), eq(media.id, pose.mediaId), eq(media.purpose, 'progress_photo'), isNull(media.deletedAt))).limit(1);
    // JSON references resolve only through caller RLS; never return a planted id or URL.
    if (asset) poses.push({ ...pose, ...(await getStorage().createDownload(asset.path, 300)) });
  }
  return { ...row, poses };
}
/** Task 8 / §12.1(3): private signed photo timeline, with stable (local_date,id) pagination. */
export async function listPhotos(tx: Tx, auth: AuthContext, input: EntryQuery) {
  const clientId = trackingClient(auth, input.clientId); await visibleClient(tx, auth, clientId);
  const { limit, cursor } = listPosition(input);
  const rows = await tx.select(clientColumns.progressPhotoSets).from(progressPhotoSets).where(and(eq(progressPhotoSets.tenantId, auth.tenantId), eq(progressPhotoSets.clientId, clientId), liveSet,
    input.from ? gte(progressPhotoSets.localDate, input.from) : undefined, input.to ? lte(progressPhotoSets.localDate, input.to) : undefined,
    cursor ? or(lt(progressPhotoSets.localDate, String(cursor.k)), and(eq(progressPhotoSets.localDate, String(cursor.k)), lt(progressPhotoSets.id, cursor.id))) : undefined)).orderBy(desc(progressPhotoSets.localDate), desc(progressPhotoSets.id)).limit(limit + 1);
  const result = page(rows, limit, row => row.localDate);
  return { ...result, items: await Promise.all(result.items.map(row => signSet(tx, auth, row))) };
}
/** Task 8: enforce active photos consent, same-client image ownership and monotonic photo sync. */
export async function savePhotos(tx: Tx, auth: AuthContext, input: z.infer<typeof photoInput>) {
  const clientId = trackingClient(auth, input.clientId, 'create'); await visibleClient(tx, auth, clientId, true); await requirePhotoConsent(tx, auth);
  if (auth.role === 'client') {
    const config = await getCadence(tx, auth, clientId);
    if (config?.progressPhotos?.rule.enabled && config.progressPhotos.poses.some(pose => !input.poses.some(item => item.pose === pose))) throw validationError(undefined, 'Required photo poses are missing');
  }
  const existingScope = and(eq(progressPhotoSets.tenantId, auth.tenantId), eq(progressPhotoSets.clientId, clientId), eq(progressPhotoSets.clientUuid, input.clientUuid));
  const [existing] = await tx.select({ id: clientColumns.progressPhotoSets.id }).from(progressPhotoSets).where(existingScope).limit(1);
  if (existing) {
    const [live] = await tx.select({ id: clientColumns.progressPhotoSets.id }).from(progressPhotoSets).where(and(existingScope, liveSet)).limit(1);
    if (!live) throw conflict('Deleted photo sets cannot be restored by sync');
  }
  const ids = input.poses.map(pose => pose.mediaId);
  const assets = await tx.select({ id: clientColumns.media.id, kind: clientColumns.media.kind }).from(media).where(and(eq(media.tenantId, auth.tenantId), eq(media.clientId, clientId), eq(media.purpose, 'progress_photo'), inArray(media.id, ids), isNull(media.deletedAt))).for('update');
  if (assets.length !== ids.length || assets.some(asset => asset.kind !== 'photo')) throw validationError(undefined, 'Every pose must reference your own progress photo');
  // Unique media ownership by a set keeps set-level soft deletion from hiding another date's photos.
  for (const id of ids) {
    const [used] = await tx.select({ id: clientColumns.progressPhotoSets.id }).from(progressPhotoSets).where(and(eq(progressPhotoSets.tenantId, auth.tenantId), eq(progressPhotoSets.clientId, clientId), sql`${progressPhotoSets.clientUuid} <> ${input.clientUuid}::uuid and ${progressPhotoSets.poses} @> ${JSON.stringify([{ mediaId: id }])}::jsonb`)).limit(1);
    if (used) throw validationError(undefined, 'Photo already belongs to another set');
  }
  const clientUpdatedAt = new Date(input.clientUpdatedAt);
  await tx.insert(progressPhotoSets).values({ tenantId: auth.tenantId, clientId, localDate: input.localDate, poses: input.poses, weightKg: input.weightKg, clientUuid: input.clientUuid, clientUpdatedAt }).onConflictDoUpdate({ target: [progressPhotoSets.tenantId, progressPhotoSets.clientId, progressPhotoSets.clientUuid], set: { localDate: input.localDate, poses: input.poses, weightKg: input.weightKg ?? null, note: null, clientUpdatedAt }, setWhere: sql`excluded.client_updated_at is not null and (${progressPhotoSets.clientUpdatedAt} is null or ${progressPhotoSets.clientUpdatedAt} < excluded.client_updated_at)` });
  const [row] = await tx.select(clientColumns.progressPhotoSets).from(progressPhotoSets).where(and(eq(progressPhotoSets.tenantId, auth.tenantId), eq(progressPhotoSets.clientId, clientId), eq(progressPhotoSets.clientUuid, input.clientUuid), liveSet)).limit(1);
  if (!row) throw notFound();
  await completeTrackingEvents(tx, auth, clientId, row.localDate, 'progress_photos');
  return signSet(tx, auth, row);
}
/** Task 8: compare exactly two visible sets from the same client; missing either side returns 404. */
export async function comparePhotos(tx: Tx, auth: AuthContext, clientIdInput: string | undefined, fromId: string, toId: string) {
  const clientId = trackingClient(auth, clientIdInput); await visibleClient(tx, auth, clientId);
  const rows = await tx.select(clientColumns.progressPhotoSets).from(progressPhotoSets).where(and(eq(progressPhotoSets.tenantId, auth.tenantId), eq(progressPhotoSets.clientId, clientId), inArray(progressPhotoSets.id, [fromId, toId]), liveSet));
  const before = rows.find(row => row.id === fromId); const after = rows.find(row => row.id === toId);
  if (!before || !after) throw notFound();
  return { before: await signSet(tx, auth, before), after: await signSet(tx, auth, after) };
}
/** Task 8: soft-delete linked progress media without erasing set history or storage objects. */
export async function deletePhotos(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'tracking', auth.role === 'client' ? 'edit' : 'delete');
  const scope = and(eq(progressPhotoSets.tenantId, auth.tenantId), eq(progressPhotoSets.id, id));
  const [row] = await tx.select(clientColumns.progressPhotoSets).from(progressPhotoSets).where(scope);
  if (!row) throw notFound();
  trackingClient(auth, row.clientId, 'delete');
  await visibleClient(tx, auth, row.clientId, true);
  const [locked] = await tx.select(clientColumns.progressPhotoSets).from(progressPhotoSets).where(scope).for('update');
  if (locked?.poses.length) {
    const assetScope = and(eq(media.tenantId, auth.tenantId), eq(media.clientId, row.clientId), eq(media.purpose, 'progress_photo'), inArray(media.id, locked.poses.map(pose => pose.mediaId)), isNull(media.deletedAt));
    const assets = await tx.select({ id: clientColumns.media.id, reviewState: clientColumns.media.reviewState }).from(media).where(assetScope);
    if (assets.some(asset => asset.reviewState === 'approved' || asset.reviewState === 'rejected')) throw forbidden();
    const updated = await tx.update(media).set({ deletedAt: new Date() }).where(assetScope).returning({ id: clientColumns.media.id });
    if (updated.length !== assets.length) throw forbidden();
  }
  return { id, deleted: true };
}
