import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { requireProgramPermission } from '@/src/server/programs/read';
import { PageHeader } from '@/src/components/shell/page-header';
import { NewProgram } from '@/components/program-builder/new-program';

/** Task 4: template setup has an authenticated coach-create boundary and streams behind loading.tsx. */
export default async function NewProgramPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection(); const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); requireProgramPermission(auth, 'create'); const t = await getTranslations('programs');
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('createTemplate')} subtitle={t('newDescription')} /><NewProgram /></div>;
}
