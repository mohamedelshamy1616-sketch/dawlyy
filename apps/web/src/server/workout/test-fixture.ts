import { randomUUID } from 'node:crypto';
import { emptyProgram } from '@dawlyy/core/program-edit';
import { clients, exercises, memberships, programs, programVersions, staffClientAssignments } from '@dawlyy/db/schema';
import { setupApiData, setupApiFixture } from '../../test/api-harness';

/** Task 5 API tests: isolated published client copies, private drafts, and assigned-scope staff. */
export async function workoutFixture() {
  const fixture = await setupApiFixture();
  try {
    const data = await setupApiData(fixture.owner.tenantId, 'workout portal fixture', async tx => {
      const tenantId = fixture.owner.tenantId;
      const exerciseId = randomUUID(); const staffUserId = randomUUID(); const staffMembership = randomUUID();
      await tx.insert(exercises).values({ id: exerciseId, tenantId, slug: `lift-${exerciseId}`, name: { en: 'Squat', ar: 'سكوات' }, category: 'strength', movementPattern: 'squat', difficulty: 'beginner' });
      const document = emptyProgram({ newId: randomUUID }, { weeks: 2, trainingDays: [0, 2] });
      document.startDate = '2026-11-09'; document.notes = { en: 'Private coach notes' };
      for (const phase of document.phases) for (const week of phase.weeks) for (const day of week.days) {
        if (day.workout) day.workout.blocks = [{ id: randomUUID(), kind: 'main', items: [{ id: randomUUID(), exerciseId, order: 0,
          sets: [1, 2, 3].map(setNo => ({ setNo, reps: '10', load: { value: 20, unit: 'kg' as const }, restSec: 60 })) }] }];
      }
      async function actor(name: string) {
        const clientId = randomUUID(); const userId = randomUUID(); const programId = randomUUID(); const versionId = randomUUID();
        await tx.insert(clients).values({ id: clientId, tenantId, firstName: name, timezone: 'Africa/Cairo' });
        await tx.insert(memberships).values({ tenantId, userId, clientId, role: 'client', status: 'active' });
        await tx.insert(programs).values({ id: programId, tenantId, clientId, kind: 'client', name: { en: `${name} plan` } });
        await tx.insert(programVersions).values({ id: versionId, tenantId, clientId, programId, versionNo: 1, status: 'published', document, publishedAt: new Date(), publishedBy: fixture.owner.userId });
        await tx.insert(programVersions).values({ tenantId, clientId, programId, versionNo: 2, status: 'draft', document: { ...document, goal: { en: 'DRAFT ONLY' } } });
        return { clientId, userId, programId, versionId };
      }
      const a = await actor('A'); const b = await actor('B');
      await tx.insert(memberships).values({ id: staffMembership, tenantId, userId: staffUserId, role: 'staff', status: 'active', permissions: { client_scope: 'assigned', modules: { clients: ['view'] } } });
      await tx.insert(staffClientAssignments).values({ tenantId, membershipId: staffMembership, clientId: a.clientId });
      const day = document.phases[0]!.weeks[0]!.days[0]!;
      return { a, b, staffUserId, exerciseId, document, dayId: day.id, workoutId: day.workout!.id };
    });
    return { ...fixture, ...data };
  } catch (error) { await fixture.cleanup(); throw error; }
}
