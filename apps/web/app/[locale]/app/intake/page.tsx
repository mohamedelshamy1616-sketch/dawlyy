import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { ClientIntakePage } from '@/components/form-runner/pages';

/** Task 7: client intake form, one submission per client and intake version. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  return <ClientIntakePage locale={locale} />;
}
