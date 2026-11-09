import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { listPrograms } from '@/src/server/programs/read';
import { programListSchema } from '@/src/server/programs/schemas';
import { programPageGrants } from '@/src/server/programs/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { ProgramList } from '@/components/program-builder/program-list';
import type { ProgramListData } from '@/components/program-builder/types';

/** Task 4: coach program directory reads through the same transaction and permission boundary as the API. */
export default async function ProgramsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = programPageGrants(auth); const t = await getTranslations('programs');
  const raw = await searchParams;
  const filters = programListSchema.parse({ ...Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])), kind: raw.kind === 'client' ? 'client' : 'template' });
  const data = await withAuthTx(auth, tx => listPrograms(tx, auth, filters));
  const initial = JSON.parse(JSON.stringify(data)) as ProgramListData;
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} /><ProgramList key={JSON.stringify([filters, initial])} initial={initial} filters={filters} grants={grants} /></div>;
}
