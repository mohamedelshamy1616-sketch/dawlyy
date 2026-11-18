# R2b integration patches (unapplied)

Apply these unified diffs at merge, in this order. They were generated against this worktree's merged base; none of the target files has been edited by the builder.

The Today file already imports `Button` from `@astryxdesign/core/Button`; keep that import. Its model and preview signature stay unchanged. The nutrition-gated control uses the existing Astryx link integration and is inert in preview.

The tracking page projection must retain history (including voided rows), server `createdAt`, and original measurement `values`. UI fields remain optional until this patch lands. Chart/current-value filters belong in the UI. All projected timestamps are real server dates serialized explicitly; no `localDate` fallback is used.

The workout list already selects `clientColumns.workoutSessions` including `createdAt`. The mapper addition needs no DB/policy/API change. The exact fixture patch adds only the newly required field and preserves every assertion.

```diff
--- a/apps/web/i18n/request.ts
+++ b/apps/web/i18n/request.ts
@@ -12,6 +12,8 @@
     coach: () => import('../messages/ar/coach.json'),
     client: () => import('../messages/ar/client.json'),
     clientToday: () => import('../messages/ar/clientToday.json'),
+    clientCorrections: () => import('../messages/ar/clientCorrections.json'),
+    quickLog: () => import('../messages/ar/quickLog.json'),
     notFound: () => import('../messages/ar/notFound.json'),
     api: () => import('../messages/ar/api.json'),
     onboarding: () => import('../messages/ar/onboarding.json'),
@@ -45,6 +47,8 @@
     coach: () => import('../messages/en/coach.json'),
     client: () => import('../messages/en/client.json'),
     clientToday: () => import('../messages/en/clientToday.json'),
+    clientCorrections: () => import('../messages/en/clientCorrections.json'),
+    quickLog: () => import('../messages/en/quickLog.json'),
     notFound: () => import('../messages/en/notFound.json'),
     api: () => import('../messages/en/api.json'),
     onboarding: () => import('../messages/en/onboarding.json'),
```

```diff
--- a/apps/web/components/client-today/today-view.tsx
+++ b/apps/web/components/client-today/today-view.tsx
@@ -40,6 +40,7 @@
  */
 export function ClientTodayView({ model, preview = false, onLogMeal, busyMealId = null, errorMealId = null }: Props) {
   const t = useTranslations('clientToday');
+  const quick = useTranslations('quickLog');
   const dates = dateParts(model);
   const number = { locale: model.locale, numerals: model.numerals } as const;
   const { workout, modules } = model;
@@ -152,6 +153,14 @@
         </VStack>
       ) : null}
 
+      {hasMeals ? (
+        <Button
+          variant="secondary" size="lg" className="min-h-11 w-full"
+          label={quick('open')} href={preview ? undefined : '/app/nutrition/log'}
+          isDisabled={preview} data-testid="today-quick-log"
+        />
+      ) : null}
+
       {hasCheckins ? (
         <VStack as="section" gap={2} className="min-w-0" aria-labelledby="today-checkins">
           <Heading level={2} id="today-checkins">{t('checkins.title')}</Heading>
```

```diff
--- a/apps/web/src/server/workout/contracts.ts
+++ b/apps/web/src/server/workout/contracts.ts
@@ -39,7 +39,7 @@
 /** Task 5: exercise metadata resolved through the client column projection. */
 export type PortalExercise = { id: string; name: LocalizedText; cues: LocalizedText[]; primaryMuscles: string[]; secondaryMuscles: string[]; videoUrl: string | null; thumbnailMediaId: string | null };
 /** Task 5: serializable session, safe for IndexedDB and offline render. */
-export type PortalSession = { id: string; clientUuid: string; programId: string | null; programVersionId: string | null; dayId: string | null; workoutId: string | null; plannedWorkout: Workout | null; state: SessionRecord['state']; localDate: string; timezone: string; startedAt: string | null; endedAt: string | null; activeSeconds: number; clientUpdatedAt: string | null; rpeOverall: number | null; mood: string | null; painNote: string | null; clientNote: string | null; summary: WorkoutSummary | null; voidedAt?: string | null };
+export type PortalSession = { id: string; clientUuid: string; createdAt: string; programId: string | null; programVersionId: string | null; dayId: string | null; workoutId: string | null; plannedWorkout: Workout | null; state: SessionRecord['state']; localDate: string; timezone: string; startedAt: string | null; endedAt: string | null; activeSeconds: number; clientUpdatedAt: string | null; rpeOverall: number | null; mood: string | null; painNote: string | null; clientNote: string | null; summary: WorkoutSummary | null; voidedAt?: string | null };
 /** Task 5: full detail and comparison, cached locally when a workout is opened. */
 export type SessionDetail = { session: PortalSession; sets: Array<SetWrite & { id: string }>; lastComparable: SessionRecord | null; exercises: PortalExercise[]; unit: 'kg' | 'lb' };
 /** Task 5 cross-task contract: only the client's own published program document. */
```

```diff
--- a/apps/web/src/server/workout/read.ts
+++ b/apps/web/src/server/workout/read.ts
@@ -22,7 +22,7 @@
 
 /** Task 5 / doc §12.1: safe session projection with portable ISO stamps. */
 export function sessionProjection(row: Omit<typeof workoutSessions.$inferSelect, 'voidedBy' | 'voidReason'>): PortalSession {
-  return { voidedAt: row.voidedAt?.toISOString() ?? null, id: row.id, clientUuid: row.clientUuid, programId: row.programId, programVersionId: row.programVersionId,
+  return { voidedAt: row.voidedAt?.toISOString() ?? null, id: row.id, clientUuid: row.clientUuid, createdAt: row.createdAt.toISOString(), programId: row.programId, programVersionId: row.programVersionId,
     dayId: row.dayId, workoutId: row.workoutId, plannedWorkout: row.plannedWorkout, state: row.state,
     localDate: row.localDate, timezone: row.timezone, startedAt: row.startedAt?.toISOString() ?? null,
     endedAt: row.endedAt?.toISOString() ?? null, activeSeconds: row.activeSeconds,
```

```diff
--- a/apps/web/src/server/tracking/page-data.ts
+++ b/apps/web/src/server/tracking/page-data.ts
@@ -15,8 +15,8 @@
     const measurementPage = await listMeasurements(tx, auth, query);
     const photoPage = await listPhotos(tx, auth, { clientId, limit: '20' });
     return { clientId, cadence, timezone: client.timezone, today: localDateOf(new Date().toISOString(), client.timezone),
-      metrics: { ...metricPage, items: metricPage.items.filter(row => row.voidedAt === null).map(({ id, metric, metricKey, value, unit, localDate, correctionOf, voidedAt }) => ({ id, metric, metricKey, value, unit, localDate, correctionOf, voidedAt })) },
-      measurements: { ...measurementPage, items: measurementPage.items.filter(row => row.voidedAt === null).map(({ id, localDate, deltas, voidedAt, replacesId }) => ({ id, localDate, deltas, voidedAt, replacesId })) },
+      metrics: { ...metricPage, items: metricPage.items.map(({ id, metric, metricKey, value, unit, localDate, correctionOf, createdAt, voidedAt }) => ({ id, metric, metricKey, value, unit, localDate, correctionOf, createdAt: createdAt.toISOString(), voidedAt: voidedAt?.toISOString() ?? null })) },
+      measurements: { ...measurementPage, items: measurementPage.items.map(({ id, localDate, values, deltas, createdAt, voidedAt, replacesId }) => ({ id, localDate, values, deltas, createdAt: createdAt.toISOString(), voidedAt: voidedAt?.toISOString() ?? null, replacesId })) },
       photos: { ...photoPage, items: photoPage.items.map(({ id, localDate, poses }) => ({ id, localDate, poses })) } };
   });
 }
```

```diff
--- a/apps/web/src/server/workout/logic.test.ts
+++ b/apps/web/src/server/workout/logic.test.ts
@@ -56,7 +56,7 @@
     expect(summary.reasons).toContain('planned_work_differs');
   });
   it('maps tombstones, warmups, skipped sets and pounds without inflating the summary', () => {
-    const session: PortalSession = { id: 'session', clientUuid: 's', programId: null, programVersionId: null, dayId: null, workoutId: 'w',
+    const session: PortalSession = { id: 'session', clientUuid: 's', createdAt: '2026-11-11T10:00:00Z', programId: null, programVersionId: null, dayId: null, workoutId: 'w',
       plannedWorkout: { id: 'w', name: { en: 'Lift' }, blocks: [{ id: 'b', kind: 'main', items: [{ id: 'i', exerciseId: 'e', order: 0, sets: [{ setNo: 1 }] }] }] },
       state: 'completed', localDate: '2026-11-11', timezone: 'Africa/Cairo', startedAt: null, endedAt: null, activeSeconds: 10,
       clientUpdatedAt: null, rpeOverall: null, mood: null, painNote: null, clientNote: null, summary: null };
```
