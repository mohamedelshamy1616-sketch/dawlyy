import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { clients, nutritionPlans, nutritionPlanVersions, programs, programVersions } from '@dawlyy/db/schema';
import type { AuthContext, Tx } from '../db';
import { assertActiveAccess } from '../access';
import { forbidden, notFound } from '../../api/errors';
import { nutritionFoods } from './client-read';
import { documentTotals } from './helpers';

/** Task 6: calendar date in the client's IANA timezone, independent of the server's timezone. */
export function nutritionDate(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value ?? '').join('-');
}
/** P7 D1: resolve free-meal entry dates without reading a subscription-gated plan. */
export async function nutritionLogContext(tx: Tx, auth: AuthContext) {
  if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  const [client] = await tx.select({ timezone: clientColumns.clients.timezone }).from(clients)
    .where(and(eq(clients.id, auth.clientId), eq(clients.tenantId, auth.tenantId))).limit(1);
  if (!client) throw notFound();
  const timezone = client.timezone ?? 'Africa/Cairo';
  return { timezone, localDate: nutritionDate(timezone) };
}
/** Task 6: all client plan/program/food reads use the safe column maps and own-client predicates. */
export async function myNutrition(tx: Tx, auth: AuthContext) {
  if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  await assertActiveAccess(tx, auth);
  const { timezone, localDate } = await nutritionLogContext(tx, auth);
  const [head] = await tx.select(clientColumns.nutritionPlans).from(nutritionPlans).where(and(eq(nutritionPlans.tenantId, auth.tenantId), eq(nutritionPlans.clientId, auth.clientId), isNull(nutritionPlans.archivedAt))).orderBy(desc(nutritionPlans.createdAt), desc(nutritionPlans.id)).limit(1);
  const [version] = head?.publishedVersionId ? await tx.select(clientColumns.nutritionPlanVersions).from(nutritionPlanVersions).where(and(eq(nutritionPlanVersions.id, head.publishedVersionId), eq(nutritionPlanVersions.planId, head.id), eq(nutritionPlanVersions.clientId, auth.clientId), eq(nutritionPlanVersions.status, 'published'))).limit(1) : [];
  const [program] = await tx.select({ document: clientColumns.programVersions.document }).from(programVersions).innerJoin(programs, and(eq(programs.publishedVersionId, programVersions.id), eq(programs.id, programVersions.programId))).where(and(eq(programs.tenantId, auth.tenantId), eq(programs.clientId, auth.clientId), isNull(programs.archivedAt), eq(programVersions.status, 'published'))).orderBy(desc(programs.createdAt), desc(programs.id)).limit(1);
  let dayType: 'training' | 'rest' = 'training';
  if (program?.document.startDate) {
    const offset = Math.floor((Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${program.document.startDate}T00:00:00Z`)) / 86400000);
    const days = program.document.phases.flatMap(p => [...p.weeks].sort((a, b) => a.index - b.index).flatMap(w => [...w.days].sort((a, b) => a.index - b.index)));
    if (offset >= 0 && days[offset]) dayType = days[offset]!.kind === 'rest' ? 'rest' : 'training';
  }
  if (!head || !version) return { head: null, version: null, foods: [], localDate, timezone, dayType, meals: [], targets: null, totals: null };
  const foods = await nutritionFoods(tx, auth, [...new Set(version.document.meals.flatMap(m => m.options.flatMap(o => o.items.map(i => i.foodId))))], true);
  const targets = version.document.dayTypes?.[dayType] ?? version.document.targets;
  return { head: { id: head.id, name: head.name, clientId: head.clientId }, version, foods, localDate, timezone, dayType, meals: version.document.meals, targets, totals: documentTotals({ ...version.document, targets }, foods) };
}
