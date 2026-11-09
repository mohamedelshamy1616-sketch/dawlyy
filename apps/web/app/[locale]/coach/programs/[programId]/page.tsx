import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { ApiError } from '@/src/api/errors';
import { getProgram } from '@/src/server/programs/read';
import { programPageGrants } from '@/src/server/programs/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { ProgramBuilder } from '@/components/program-builder/builder';
import type { ProgramDetail } from '@/components/program-builder/types';

/** Task 4: request-scoped snapshot initializes the core-operation builder without shared caching. */
export default async function ProgramBuilderPage({ params }: { params: Promise<{ locale: string; programId: string }> }) {
  await connection(); const { locale, programId } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = programPageGrants(auth); const t = await getTranslations('programs');
  if (!z.string().uuid().safeParse(programId).success) notFound();
  const data = await withAuthTx(auth, tx => getProgram(tx, auth, programId)).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const initial = JSON.parse(JSON.stringify(data)) as ProgramDetail;
  const name = locale === 'ar' ? data.head.name.ar || data.head.name.en : data.head.name.en || data.head.name.ar;
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={name || t('builderTitle')} subtitle={t('builderDescription')} /><ProgramBuilder key={initial.revision} initial={initial} grants={grants} /></div>;
}
