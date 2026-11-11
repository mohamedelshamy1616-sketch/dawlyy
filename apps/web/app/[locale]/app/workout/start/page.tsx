import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { completedDays, getToday, portalIdentity, publishedProgram } from '@/src/server/workout/portal';
import { resolveProgramDay } from '@/src/server/workout/logic';
import { StartWorkout } from '@/components/client-portal/start-workout';
import { PortalFrame } from '@/components/client-portal/portal-frame';

/** Task 5: GET resolves today's target; the client caches an idempotent POST before redirecting. */
export default async function StartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale); const auth = await requirePage();
  const target = await withAuthTx(auth, async tx => {
    const today = await getToday(tx, auth);
    if (today.workout.sessionId) return { sessionId: today.workout.sessionId, start: null };
    const program = await publishedProgram(tx, auth); if (!program) return { start: null };
    const selection = resolveProgramDay(program.document, program.document.startDate, today.date, await completedDays(tx, auth, program.programId));
    if (selection.state !== 'planned' || !selection.day?.workout) return { start: null };
    const identity = await portalIdentity(tx, auth);
    return { start: { programId: program.programId, programVersionId: program.versionId, dayId: selection.day.id, workoutId: selection.day.workout.id, localDate: today.date, timezone: identity.timezone } };
  });
  const t = await getTranslations('workout');
  return <PortalFrame title={t('startTitle')}><StartWorkout target={target} /></PortalFrame>;
}
