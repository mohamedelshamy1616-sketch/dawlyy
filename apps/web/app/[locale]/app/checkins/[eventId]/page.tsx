import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { ClientRunnerPage } from '@/components/form-runner/pages';

/** Task 7: client runner for one checkin calendar event. */
export default async function Page({ params }: { params: Promise<{ locale: string; eventId: string }> }) {
  await connection();
  const { locale, eventId } = await params; setRequestLocale(locale);
  return <ClientRunnerPage eventId={eventId} formKind="checkin" locale={locale} />;
}
