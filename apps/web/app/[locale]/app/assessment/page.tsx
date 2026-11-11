import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { ClientEventListPage } from '@/components/form-runner/pages';

/** Task 7: client list of due, upcoming and past assessments. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  return <ClientEventListPage formKind="assessment" basePath="/app/assessment" />;
}
