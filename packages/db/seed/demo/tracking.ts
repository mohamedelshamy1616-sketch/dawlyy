import { and, eq } from 'drizzle-orm';
import { addDays, zonedDueAt } from '@dawlyy/core/schedule';
import { compareSessions, type SessionRecord } from '@dawlyy/core/workout';
import type { Tx } from '../../src/client';
import { mealLogs, measurementSets, media, metricEntries, nutritionPlanVersions, programVersions, progressPhotoSets, setLogs, workoutSessions } from '../../src/schema';
import { DEMO_IDS as I, demoId } from './ids';
import { DEMO_CLIENTS, type Demo } from './model';
import { exists } from './helpers';

/** doc §8, §12.1(12,15) / Task 12: eight-week trends, measurements, explicit no-file photo placeholder and persisted workout/meal history. */
export async function seedTracking(tx: Tx, demo: Demo): Promise<void> {
  for (const [clientNumber, clientId] of [I.firstClient, I.secondClient, I.thirdClient, I.fifthClient].entries()) {
    for (let week = 0; week < 8; week++) {
      const localDate = addDays(demo.today, -50 + week * 7);
      const id = demoId(`weight:${clientId}:${week}`);
      if (await exists(tx, metricEntries, id)) continue;
      const recordedAt = new Date(zonedDueAt(localDate, '07:00', 'Africa/Cairo'));
      await tx.insert(metricEntries).values({ id, tenantId: I.tenant, clientId, metric: 'weight', unit: 'kg',
        value: Math.round(([82, 78, 94, 88][clientNumber]! - week * [0.15, 0.45, 0.35, 0.3][clientNumber]!) * 10) / 10,
        source: 'manual', localDate, timezone: 'Africa/Cairo', recordedAt, clientUuid: id, clientUpdatedAt: recordedAt,
        note: 'وزن الصبح قبل الفطار — بيانات تجربة', createdAt: recordedAt });
    }
  }
  for (const [index, days] of [-28, -1].entries()) {
    const id = demoId(`measurements:${index}`);
    if (!await exists(tx, measurementSets, id)) await tx.insert(measurementSets).values({ id, tenantId: I.tenant, clientId: I.firstClient,
      localDate: addDays(demo.today, days), values: [{ type: 'waist', value: 88 - index * 2, unit: 'cm' },
        { type: 'chest', value: 102 + index, unit: 'cm' }, { type: 'hips', value: 100 - index, unit: 'cm' }],
      takenBy: 'coach', note: 'مقاسات تجربة وهمية', clientUuid: id, clientUpdatedAt: demo.now,
      createdAt: new Date(zonedDueAt(addDays(demo.today, days), '09:00', 'Africa/Cairo')) });
  }
  if (!await exists(tx, media, I.progressPhoto)) await tx.insert(media).values({ id: I.progressPhoto, tenantId: I.tenant,
    clientId: I.firstClient, ownerUserId: I.ownerUser, bucket: 'client-media', path: `${I.tenant}/clients/${I.firstClient}/demo-front-placeholder.png`,
    kind: 'photo', purpose: 'progress_photo', mimeType: 'image/png', bytes: 0, reviewState: 'requested', uploadedAt: null,
    metadata: { demoPlaceholder: true, hasFile: false, label: 'مكان صورة للتجربة — مفيش صورة حقيقية' }, createdAt: demo.now });
  const photoId = demoId('progress-photo-set');
  if (!await exists(tx, progressPhotoSets, photoId)) await tx.insert(progressPhotoSets).values({ id: photoId, tenantId: I.tenant,
    clientId: I.firstClient, localDate: demo.today, poses: [{ pose: 'front', mediaId: I.progressPhoto, label: 'مكان صورة للتجربة بس — مفيش ملف' }],
    note: 'سجل توضيحي بس، مفيش صورة شخصية ولا ملف مرفوع', clientUuid: photoId, clientUpdatedAt: demo.now, createdAt: demo.now });

  for (const clientIndex of [0, 7]) {
    const client = DEMO_CLIENTS[clientIndex]!;
    const versionId = demoId(`program-version:${client.id}`);
    const [version] = await tx.select().from(programVersions).where(and(eq(programVersions.tenantId, I.tenant), eq(programVersions.id, versionId))).limit(1);
    if (!version) throw new Error('Demo workout assignment missing.');
    const phase = version.document.phases[0]!, week = phase.weeks[0]!;
    const day = week.days.find(d => d.kind === 'training' && d.workout);
    if (!day?.workout) throw new Error('Demo program needs a prescribed workout.');
    const plan = day.workout;
    const offsets = clientIndex === 0 ? [-28, -25, -21, -18, -14, -11, -7, -4] : [-35, -32, -28, -25, -21, -18, -13, -9];
    let previous: SessionRecord | null = null;
    for (const [sessionNumber, offset] of offsets.entries()) {
      const id = demoId(`session:${client.id}:${sessionNumber}`);
      const localDate = addDays(demo.today, offset), startedAt = new Date(zonedDueAt(localDate, '18:00', 'Africa/Cairo'));
      const endedAt = new Date(startedAt.getTime() + 50 * 60000);
      const scope = and(eq(workoutSessions.tenantId, I.tenant), eq(workoutSessions.clientId, client.id), eq(workoutSessions.id, id));
      const present = await exists(tx, workoutSessions, id);
      if (!present) {
        await tx.insert(workoutSessions).values({ id, tenantId: I.tenant, clientId: client.id, programId: version.programId, programVersionId: version.id,
          phaseId: phase.id, weekId: week.id, dayId: day.id, workoutId: plan.id, plannedWorkout: plan, state: 'not_started',
          localDate, timezone: 'Africa/Cairo', clientUuid: id, clientUpdatedAt: startedAt, createdAt: startedAt });
        await tx.update(workoutSessions).set({ state: 'active', startedAt }).where(scope);
        for (const block of plan.blocks) for (const item of block.items) for (const planned of item.sets) {
          const setId = demoId(`set:${id}:${item.id}:${planned.setNo}`);
          const duration = planned.durationSec;
          await tx.insert(setLogs).values({ id: setId, tenantId: I.tenant, clientId: client.id, sessionId: id, exerciseId: item.exerciseId,
            blockId: block.id, itemId: item.id, setNo: planned.setNo, tag: block.kind === 'warmup' ? 'warmup' : 'working',
            ...(duration ? { durationSec: duration } : { reps: 8 + sessionNumber % 3, load: (clientIndex === 0 ? 30 : 15) + sessionNumber * 2.5,
              loadUnit: 'kg', rpe: 7, rir: 2, restSec: 90 }), completed: true, skipped: false,
            clientUuid: setId, clientUpdatedAt: endedAt, createdAt: startedAt });
        }
        await tx.update(workoutSessions).set({ state: 'completed', endedAt, activeSeconds: 3000, rpeOverall: 7,
          clientNote: 'خلصت التمرين والحركة كانت مريحة', clientUpdatedAt: endedAt, updatedAt: endedAt }).where(scope);
      }
      const stored = await tx.select().from(setLogs).where(and(eq(setLogs.tenantId, I.tenant), eq(setLogs.clientId, client.id), eq(setLogs.sessionId, id)));
      const current: SessionRecord = { id, workoutId: plan.id, localDate, state: 'completed', activeSeconds: 3000,
        plannedSetCount: plan.blocks.filter(b => b.kind !== 'warmup').reduce((n, b) => n + b.items.reduce((sum, item) => sum + item.sets.length, 0), 0),
        sets: stored.filter(s => !s.deletedAt).map(s => ({ exerciseId: s.exerciseId, setNo: s.setNo,
          tag: s.tag === 'warmup' ? 'warmup' : 'working', completed: s.completed, skipped: s.skipped,
          reps: s.reps ?? undefined, load: s.load ?? undefined, loadUnit: s.loadUnit === 'lb' ? 'lb' : 'kg', durationSec: s.durationSec ?? undefined })) };
      // Re-read actual sets before computing; never manufacture the summary from the prescription (§12.1(15)).
      if (!present) await tx.update(workoutSessions).set({ summary: { ...compareSessions(current, previous) } }).where(scope);
      previous = current;
    }
  }
  const [diet] = await tx.select().from(nutritionPlanVersions).where(and(eq(nutritionPlanVersions.tenantId, I.tenant),
    eq(nutritionPlanVersions.id, demoId(`diet-version:${I.firstClient}`)))).limit(1);
  if (!diet) throw new Error('Demo meal-log nutrition assignment missing.');
  for (let day = 0; day < 7; day++) for (const meal of diet.document.meals) {
    const id = demoId(`meal-log:${day}:${meal.id}`);
    if (!await exists(tx, mealLogs, id)) {
      const localDate = addDays(demo.today, day - 7), recordedAt = new Date(zonedDueAt(localDate, '20:00', 'Africa/Cairo'));
      await tx.insert(mealLogs).values({ id, tenantId: I.tenant, clientId: I.firstClient, planVersionId: diet.id, localDate,
        mealId: meal.id, optionId: meal.options[0]!.id, status: 'eaten', note: 'الوجبة زي الخطة', clientUuid: id,
        clientUpdatedAt: recordedAt, recordedAt, createdAt: recordedAt });
    }
  }
}
