import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { PageHeader } from '@/src/components/shell/page-header';
import { LibraryHub } from '@/components/inbox/hubs';

/** R1b: existing library lists, archives and creation tools in one destination. */
export default async function LibraryPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection(); const { locale } = await params; setRequestLocale(locale);
  await requirePage(); const t = await getTranslations('nav');
  return <section className="flex min-w-0 max-w-full flex-col gap-6"><PageHeader title={t('coach.library')} subtitle={t('librarySubtitle')} /><LibraryHub /></section>;
}
