import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { FormBuilderPage } from '@/components/form-builder/builder-page';

/** Task 7: intake form template builder. */
export default async function Page({ params }: { params: Promise<{ locale: string; formId: string }> }) {
  await connection();
  const { locale, formId } = await params; setRequestLocale(locale);
  return <FormBuilderPage formKind="intake" formId={formId} locale={locale} />;
}
