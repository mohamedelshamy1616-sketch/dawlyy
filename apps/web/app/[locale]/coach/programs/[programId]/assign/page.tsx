import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { ApiError, forbidden } from '@/src/api/errors';
import { getProgram } from '@/src/server/programs/read';
import { programPageGrants } from '@/src/server/programs/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { AssignProgram } from '@/components/program-builder/assign';

/** Task 4: assignment resolves the template under RLS before offering a client-specific copy. */
export default async function ProgramAssignPage({ params }: { params: Promise<{ locale: string; programId: string }> }) {
  await connection(); const { locale, programId } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = programPageGrants(auth); const t = await getTranslations('programs');
  if (!grants.edit && !grants.publish) throw forbidden();
  if (!z.string().uuid().safeParse(programId).success) notFound();
  const data = await withAuthTx(auth, tx => getProgram(tx, auth, programId)).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  if (data.head.kind !== 'template') notFound();
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('assignTitle')} subtitle={t('assignDescription')} /><AssignProgram id={programId} canPublish={grants.publish} canEdit={grants.edit} published={data.head.publishedVersionId !== null} /></div>;
}
