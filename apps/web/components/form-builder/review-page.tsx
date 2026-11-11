import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { coachSubmission, formModule } from '@/src/server/forms/read';
import { missingAsNotFound, toJson } from '@/src/server/forms/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import type { ReviewDetail } from './contracts';
import { ReviewPanel } from './review-panel';

/** Task 7: coach review of one submission against its pinned form version. */
export async function FormReviewPage({ submissionId }: { submissionId: string }) {
  const auth = await requirePage();
  const t = await getTranslations('forms');
  if (!z.uuid().safeParse(submissionId).success) notFound();
  const data = await withAuthTx(auth, tx => coachSubmission(tx, auth, submissionId)).catch(missingAsNotFound);
  const canReview = isAllowed(auth, formModule(data.submission.formKind), 'review');
  return <div className="grid min-w-0 max-w-full gap-5 [overflow-wrap:anywhere]">
    <PageHeader title={t('review.title')} subtitle={t('review.subtitle')} />
    <ReviewPanel detail={toJson<ReviewDetail>(data)} canReview={canReview} />
  </div>;
}
