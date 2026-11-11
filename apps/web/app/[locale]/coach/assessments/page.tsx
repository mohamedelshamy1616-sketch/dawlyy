import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { FormHubPage } from '@/components/form-builder/hub-page';

/** Task 7: assessment hub, review queue and templates. */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  return <FormHubPage formKind="assessment" search={await searchParams} />;
}
