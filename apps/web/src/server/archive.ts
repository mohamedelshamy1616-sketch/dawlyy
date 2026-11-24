import 'server-only';
import { and, eq } from 'drizzle-orm';
import { exercises, forms, nutritionPlans, packages, programs } from '@dawlyy/db/schema';
import type { AuthContext, Tx } from './db';
import { requirePermission } from './require-permission';
import { forbidden, notFound, unprocessable } from '../api/errors';
import { postgresCode } from './postgres-code';
import { isAllowed } from '@dawlyy/core/authz';
import { requireFormPermission } from './forms/read';

/** R0c: archive stamps and audits belong to 0008; locked no-ops preserve the original stamps. */
export async function setLibraryArchived(tx: Tx, auth: AuthContext,
  entity: 'packages' | 'programs' | 'nutrition' | 'forms' | 'exercises', id: string, archived: boolean) {
  if (auth.role === 'client') throw forbidden();
  if (entity === 'forms') {
    if (!(['forms', 'checkins', 'assessments'] as const).some(moduleName => isAllowed(auth, moduleName, 'edit'))) throw forbidden();
  } else requirePermission(auth, entity, 'edit');
  async function change<T extends { archivedAt: Date | null }>(read: () => Promise<T[]>, write: (at: Date | null) => Promise<T[]>) {
    const [row] = await read(); if (!row) throw notFound();
    if ((row.archivedAt !== null) === archived) return row;
    const [updated] = await write(archived ? new Date() : null);
    if (!updated) throw notFound(); return updated;
  }
  try {
    switch (entity) {
      case 'packages': {
        const scope = and(eq(packages.tenantId, auth.tenantId), eq(packages.id, id));
        return await change(() => tx.select().from(packages).where(scope).for('update'), at => tx.update(packages).set({ archivedAt: at }).where(scope).returning());
      }
      case 'programs': {
        const scope = and(eq(programs.tenantId, auth.tenantId), eq(programs.id, id));
        return await change(() => tx.select().from(programs).where(scope).for('update'), at => tx.update(programs).set({ archivedAt: at }).where(scope).returning());
      }
      case 'nutrition': {
        const scope = and(eq(nutritionPlans.tenantId, auth.tenantId), eq(nutritionPlans.id, id));
        return await change(() => tx.select().from(nutritionPlans).where(scope).for('update'), at => tx.update(nutritionPlans).set({ archivedAt: at }).where(scope).returning());
      }
      case 'forms': {
        const scope = and(eq(forms.tenantId, auth.tenantId), eq(forms.id, id));
        const [row] = await tx.select({ formKind: forms.formKind }).from(forms).where(scope).for('update');
        if (!row) throw notFound();
        requireFormPermission(auth, row.formKind, 'edit');
        return await change(() => tx.select().from(forms).where(scope).for('update'), at => tx.update(forms).set({ archivedAt: at, ...(archived ? { isDefault: 0 } : {}) }).where(scope).returning());
      }
      case 'exercises': {
        // Shared exercises have no UPDATE policy; resolve them before attempting the tenant-only update.
        const [row] = await tx.select({ tenantId: exercises.tenantId }).from(exercises).where(eq(exercises.id, id)).limit(1);
        if (!row) throw notFound();
        if (row.tenantId === null) throw unprocessable('system_exercise_use_hide', 'Use the per-tenant exercise hide', { path: `/api/v1/exercises/${id}/hide` });
        const scope = and(eq(exercises.tenantId, auth.tenantId), eq(exercises.id, id));
        return await change(() => tx.select().from(exercises).where(scope).for('update'), at => tx.update(exercises).set({ archivedAt: at }).where(scope).returning());
      }
    }
  } catch (error) { if (postgresCode(error) === '42501') throw forbidden(); throw error; }
}
