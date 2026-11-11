import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getPortalProgram } from '@/src/server/workout/portal';
import { readExercises, workoutExerciseIds } from '@/src/server/workout/read';
import { ProgramView } from '@/components/client-portal/program-view';
import { PortalEmpty, PortalFrame } from '@/components/client-portal/portal-frame';

/** Task 5: published client copy and RLS-projected exercise media; week selection stays local. */
export default async function ProgramPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale); const auth = await requirePage();
  const data = await withAuthTx(auth, async tx => {
    const program = await getPortalProgram(tx, auth);
    const ids = program?.document.phases.flatMap(p => p.weeks.flatMap(w => w.days.flatMap(d => workoutExerciseIds(d.workout ?? null)))) ?? [];
    return { program, exercises: await readExercises(tx, ids) };
  });
  const t = await getTranslations('workout');
  return <PortalFrame title={t('program')}>{data.program ? <ProgramView program={data.program} exercises={data.exercises} /> : <PortalEmpty program />}</PortalFrame>;
}
