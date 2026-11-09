import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { ApiError } from '@/src/api/errors';
import { listProgramVersions } from '@/src/server/programs/read';
import { programPageGrants } from '@/src/server/programs/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { ProgramHistory } from '@/components/program-builder/history';
import type { ProgramHistoryData } from '@/components/program-builder/types';

/** Task 4: coach-only version history and core document comparison. */
export default async function ProgramHistoryPage({ params }: { params: Promise<{ locale: string; programId: string }> }) {
  await connection(); const { locale, programId } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = programPageGrants(auth); const t = await getTranslations('programs');
  if (!z.string().uuid().safeParse(programId).success) notFound();
  const data = await withAuthTx(auth, tx => listProgramVersions(tx, auth, programId, {})).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const initial = JSON.parse(JSON.stringify(data)) as ProgramHistoryData;
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('history')} subtitle={t('historyDescription')} /><ProgramHistory id={programId} initial={initial} canEdit={grants.edit} /></div>;
}
