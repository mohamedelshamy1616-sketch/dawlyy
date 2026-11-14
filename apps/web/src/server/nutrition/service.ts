import 'server-only';
import { and, desc, eq, isNull, isNotNull, ne, sql } from 'drizzle-orm';
import { clients, nutritionPlans, nutritionPlanVersions, subscriptions } from '@dawlyy/db/schema';
import { NutritionTargets, type NutritionDocument } from '@dawlyy/core/types';
import { nextVersionNo, publish } from '@dawlyy/core/versioning';
import { equivalentQuantity, planConflicts } from '@dawlyy/core/nutrition';
import { searchKey } from '@dawlyy/core/text';
import type { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { ApiError, notFound, unprocessable } from '../../api/errors';
import { documentRevision, getNutrition, getNutritionVersion, nutritionHead, nutritionIssues, nutritionPermission } from './read';
import { foodsByIds, nutritionFoods } from './foods';
import { foodMap, normalizeDocument } from './helpers';
import { draftDocumentSchema, type assignSchema, type createPlanSchema, type draftSchema, type patchPlanSchema, type publishSchema, type revertSchema } from './schemas';

type Head = typeof nutritionPlans.$inferSelect;
type Version = typeof nutritionPlanVersions.$inferSelect;
async function lock(tx: Tx, id: string) { await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}::text, 0))`); }
async function allVersions(tx: Tx, id: string) { return tx.select().from(nutritionPlanVersions).where(eq(nutritionPlanVersions.planId, id)).orderBy(desc(nutritionPlanVersions.versionNo)); }
async function working(tx: Tx, head: Head) {
  const [v] = await tx.select().from(nutritionPlanVersions).where(and(eq(nutritionPlanVersions.planId, head.id), eq(nutritionPlanVersions.id, head.currentVersionId ?? head.id))).limit(1);
  if (!v) throw notFound(); return v;
}
function fresh(v: Version, body: { baseVersionNo?: number; baseRevision?: string }) {
  if ((body.baseVersionNo !== undefined && body.baseVersionNo !== v.versionNo) || (body.baseRevision !== undefined && body.baseRevision !== documentRevision({ id: v.id, status: v.status, document: v.document }))) throw new ApiError(409, 'stale_draft', 'Reload the changed draft');
}
async function insertDraft(tx: Tx, head: Head, document: NutritionDocument, changeNote?: string) {
  const [v] = await tx.insert(nutritionPlanVersions).values({ tenantId: head.tenantId, planId: head.id, versionNo: nextVersionNo(await allVersions(tx, head.id)), status: 'draft', document, changeNote }).returning();
  if (!v) throw notFound();
  await tx.update(nutritionPlans).set({ currentVersionId: v.id }).where(eq(nutritionPlans.id, head.id)); return v;
}
/** Task 6: create a template and empty v1 atomically, with editable starting targets. */
export async function createNutrition(tx: Tx, auth: AuthContext, body: z.infer<typeof createPlanSchema>) {
  nutritionPermission(auth, 'create');
  const [head] = await tx.insert(nutritionPlans).values({ tenantId: auth.tenantId, kind: 'template', name: body.name, tags: body.tags ?? [] }).returning(); if (!head) throw notFound();
  await insertDraft(tx, head, { schemaVersion: 1, targets: body.targets ?? { kcal: 2000, proteinG: 120, carbsG: 240, fatG: 60, waterMl: 2500, steps: 8000 }, meals: [], supplements: [], allergens: [] });
  return getNutrition(tx, auth, head.id, 'create');
}
/** Task 6: metadata edits accept neither version pointers nor stamps. */
export async function patchNutrition(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof patchPlanSchema>) {
  nutritionPermission(auth, 'edit'); await lock(tx, id); const head = await nutritionHead(tx, auth, id, 'edit');
  await tx.update(nutritionPlans).set({ ...(body.name === undefined ? {} : { name: body.name }), ...(body.tags === undefined ? {} : { tags: body.tags }), ...(body.archived === undefined ? {} : { archivedAt: body.archived ? head.archivedAt ?? new Date() : null }) }).where(eq(nutritionPlans.id, id));
  return getNutrition(tx, auth, id, 'edit');
}
/** Task 6: published edits append N+1; same-version edits require fresh preconditions. */
export async function putNutritionDraft(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof draftSchema>) {
  nutritionPermission(auth, 'edit'); await lock(tx, id); const head = await nutritionHead(tx, auth, id, 'edit'); const v = await working(tx, head); fresh(v, body);
  if (v.status === 'in_review' || v.status === 'approved') throw unprocessable('review_locked');
  const parsed = draftDocumentSchema.parse(body.document);
  const ids = parsed.meals.flatMap(m => m.options.flatMap(o => o.items.map(i => i.foodId)));
  const document = normalizeDocument(parsed, await nutritionFoods(tx, auth, ids));
  if (v.status === 'draft') {
    await tx.update(nutritionPlanVersions).set({ document, ...(body.changeNote === undefined ? {} : { changeNote: body.changeNote }) }).where(and(eq(nutritionPlanVersions.id, v.id), eq(nutritionPlanVersions.status, 'draft')));
    await tx.update(nutritionPlans).set({ currentVersionId: v.id }).where(eq(nutritionPlans.id, id));
  } else await insertDraft(tx, head, document, body.changeNote);
  return getNutrition(tx, auth, id, 'edit');
}
async function publishWorking(tx: Tx, auth: AuthContext, head: Head, body: z.infer<typeof publishSchema>) {
  nutritionPermission(auth, 'publish'); const v = await working(tx, head); fresh(v, body);
  if (v.status !== 'draft' && v.status !== 'approved') throw unprocessable('nothing_to_publish');
  const issues = await nutritionIssues(tx, auth, v.document); if (issues.length) throw unprocessable('plan_invalid', 'Resolve plan issues before publishing', issues);
  if (head.clientId) {
    const [other] = await tx.select({ id: nutritionPlans.id }).from(nutritionPlans).where(and(eq(nutritionPlans.tenantId, auth.tenantId), eq(nutritionPlans.clientId, head.clientId), ne(nutritionPlans.id, head.id), isNull(nutritionPlans.archivedAt), isNotNull(nutritionPlans.publishedVersionId))).limit(1);
    if (other) throw new ApiError(409, 'client_has_plan', 'Replace the existing plan explicitly');
  }
  const versions = await allVersions(tx, head.id);
  // Empty/incomplete historical drafts are valid working material, not publishable core snapshots.
  const decision = publish(versions.filter(p => p.id !== v.id && (p.status === 'published' || p.status === 'superseded')).map(p => ({ id: p.id, versionNo: p.versionNo, status: p.status, document: p.document, ...(p.publishedAt ? { publishedAt: p.publishedAt.toISOString() } : {}) })), { document: v.document, changeNote: body.changeNote }, new Date().toISOString());
  if (body.changeNote !== undefined && body.changeNote !== v.changeNote) {
    if (v.status !== 'draft') throw unprocessable('review_locked');
    await tx.update(nutritionPlanVersions).set({ changeNote: body.changeNote }).where(eq(nutritionPlanVersions.id, v.id));
  }
  for (const old of decision.supersededIds) await tx.update(nutritionPlanVersions).set({ status: 'superseded' }).where(and(eq(nutritionPlanVersions.id, old), eq(nutritionPlanVersions.planId, head.id)));
  const [result] = await tx.update(nutritionPlanVersions).set({ status: 'published' }).where(eq(nutritionPlanVersions.id, v.id)).returning(); if (!result) throw notFound();
  await tx.execute(sql`select app.audit('nutrition_plan.publish', 'nutrition_plan_versions', ${v.id}, null, ${JSON.stringify({ versionNo: v.versionNo })}::jsonb, ${body.changeNote ?? v.changeNote ?? null})`);
  await tx.execute(sql`select app.emit_event('nutrition_plan.published', 'nutrition_plan_versions', ${v.id}, ${JSON.stringify({ planId: head.id, versionNo: v.versionNo })}::jsonb)`);
  return result;
}
/** Task 6 / §12.1.5: supersede then publish; trigger alone writes the published pointer. */
export async function publishNutrition(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof publishSchema>) {
  const preliminary = await nutritionHead(tx, auth, id, 'publish');
  if (preliminary.clientId) await lock(tx, `nutrition-client:${auth.tenantId}:${preliminary.clientId}`);
  await lock(tx, id); return publishWorking(tx, auth, await nutritionHead(tx, auth, id, 'publish'), body);
}
/** Task 6: a revert appends a new draft even when other unpublished versions exist. */
export async function revertNutrition(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof revertSchema>) {
  nutritionPermission(auth, 'edit'); await lock(tx, id); const head = await nutritionHead(tx, auth, id, 'edit');
  const source = await getNutritionVersion(tx, auth, id, body.toVersionNo, 'edit'); await insertDraft(tx, head, structuredClone(source.document), body.changeNote);
  return getNutrition(tx, auth, id, 'edit');
}
/** Task 6: duplicate a reusable plan into an independent template draft. */
export async function duplicateNutrition(tx: Tx, auth: AuthContext, id: string) {
  nutritionPermission(auth, 'create'); await lock(tx, id); const source = await nutritionHead(tx, auth, id, 'create'); const v = await working(tx, source);
  const [head] = await tx.insert(nutritionPlans).values({ tenantId: auth.tenantId, kind: 'template', name: source.name, tags: source.tags }).returning(); if (!head) throw notFound();
  await insertDraft(tx, head, structuredClone(v.document)); return getNutrition(tx, auth, head.id, 'create');
}
/** Task 6: immutable template provenance and independent client snapshots, serialized per client. */
export async function assignNutrition(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof assignSchema>) {
  const action = body.publish ? 'publish' : 'edit'; nutritionPermission(auth, action);
  const template = await nutritionHead(tx, auth, id, action); if (template.kind !== 'template') throw unprocessable('template_required');
  if (!template.publishedVersionId) throw unprocessable('template_not_published');
  await lock(tx, `nutrition-client:${auth.tenantId}:${body.clientId}`);
  const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, body.clientId), eq(clients.tenantId, auth.tenantId))).limit(1); if (!client) throw notFound();
  const [source] = await tx.select({ document: nutritionPlanVersions.document }).from(nutritionPlanVersions).where(and(eq(nutritionPlanVersions.id, template.publishedVersionId), eq(nutritionPlanVersions.planId, id), eq(nutritionPlanVersions.status, 'published'))).limit(1); if (!source) throw unprocessable('template_not_published');
  const [subscription] = await tx.select({ id: subscriptions.id }).from(subscriptions).where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.clientId, body.clientId), body.subscriptionId ? eq(subscriptions.id, body.subscriptionId) : eq(subscriptions.state, 'active'))).orderBy(desc(subscriptions.startsOn), desc(subscriptions.id)).limit(1); if (body.subscriptionId && !subscription) throw notFound();
  const existing = await tx.select().from(nutritionPlans).where(and(eq(nutritionPlans.tenantId, auth.tenantId), eq(nutritionPlans.clientId, body.clientId), isNull(nutritionPlans.archivedAt))).orderBy(desc(nutritionPlans.createdAt));
  if (existing.length && !body.replace) throw new ApiError(409, 'client_has_plan', 'Client already has a plan');
  if (existing.length > 1) throw new ApiError(409, 'client_has_plan', 'Review multiple active plans before replacement');
  let head: Head;
  if (existing[0]) {
    await lock(tx, existing[0].id); head = await nutritionHead(tx, auth, existing[0].id, action);
    const current = await working(tx, head); if (current.status === 'draft' || current.status === 'in_review' || current.status === 'approved') throw new ApiError(409, 'stale_draft', 'Finish unpublished work before replacement');
    const [updated] = await tx.update(nutritionPlans).set({ name: template.name, subscriptionId: subscription?.id ?? null }).where(eq(nutritionPlans.id, head.id)).returning(); if (!updated) throw notFound(); head = updated;
  } else {
    const [created] = await tx.insert(nutritionPlans).values({ tenantId: auth.tenantId, kind: 'client', clientId: body.clientId, templateId: template.id, subscriptionId: subscription?.id ?? null, name: template.name }).returning(); if (!created) throw notFound(); head = created;
  }
  // NutritionDocument has no start date: keep the requested schedule as a coach-only version note.
  const v = await insertDraft(tx, head, structuredClone(source.document), body.startDate ? `Start date: ${body.startDate}` : undefined);
  if (body.publish) await publishWorking(tx, auth, { ...head, currentVersionId: v.id }, {});
  return getNutrition(tx, auth, head.id, action);
}
/** Task 6: read-only reuse analysis; core flags plus an explicit schedule compatibility flag. */
export async function reuseCheck(tx: Tx, auth: AuthContext, planId: string, clientId: string) {
  const plan = await getNutrition(tx, auth, planId);
  if (!plan.currentVersion.document.meals.length) return { conflicts: [{ code: 'plan_invalid', detail: '' }] };
  const [client] = await tx.select({ profile: clients.profile }).from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, auth.tenantId))).limit(1); if (!client) throw notFound();
  const p = client.profile; const targets = NutritionTargets.safeParse(p.targets);
  const foods = plan.foods; const allergies = new Set((p.allergies ?? []).map(searchKey));
  const allergenIds = foods.filter(f => [f.name.ar, f.name.en, ...f.aliases].some(n => n && allergies.has(searchKey(n)))).map(f => f.id);
  const conflicts: Array<{ code: string; detail: string }> = planConflicts(plan.currentVersion.document, { allergies: [...(p.allergies ?? []), ...allergenIds], ...(typeof p.weightKg === 'number' ? { weightKg: p.weightKg } : {}), ...(targets.success ? { targets: targets.data } : {}) });
  const preferred = p.schedule?.preferredTime;
  if (preferred && plan.currentVersion.document.meals.some(m => m.timeHint && ![m.timeHint.ar, m.timeHint.en].includes(preferred))) conflicts.push({ code: 'schedule', detail: preferred });
  return { conflicts };
}
/** Task 6: use core equivalent quantity; clients may resolve only plan-referenced foods. */
export async function substituteFood(tx: Tx, auth: AuthContext, body: { foodId: string; toFoodId: string; grams: number; rule: 'protein' | 'carbs' | 'fat' | 'kcal' }) {
  if (auth.role !== 'client') nutritionPermission(auth, 'view');
  const rows = auth.role === 'client' ? (await foodsByIds(tx, auth, [body.foodId, body.toFoodId])).items : await nutritionFoods(tx, auth, [body.foodId, body.toFoodId]);
  const map = foodMap(rows.filter(f => !f.hidden)); const from = map.get(body.foodId); const to = map.get(body.toFoodId); if (!from || !to) throw notFound();
  return equivalentQuantity(from, to, body.grams, body.rule);
}
/** Task 6: historic mutation is explicitly refused at the API boundary. */
export async function refuseNutritionVersionWrite(tx: Tx, auth: AuthContext, id: string, versionNo: number): Promise<never> {
  const v = await getNutritionVersion(tx, auth, id, versionNo, 'edit');
  if (v.publishedAt || v.status === 'published' || v.status === 'superseded') throw new ApiError(409, 'version_immutable', 'Create a new draft');
  throw unprocessable('use_draft_route');
}
