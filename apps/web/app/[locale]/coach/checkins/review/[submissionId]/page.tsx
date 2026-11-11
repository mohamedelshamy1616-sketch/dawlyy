import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { FormReviewPage } from '@/components/form-builder/review-page';

/** Task 7: coach review of one submission. */
export default async function Page({ params }: { params: Promise<{ locale: string; submissionId: string }> }) {
  await connection();
  const { locale, submissionId } = await params; setRequestLocale(locale);
  return <FormReviewPage submissionId={submissionId} />;
}
