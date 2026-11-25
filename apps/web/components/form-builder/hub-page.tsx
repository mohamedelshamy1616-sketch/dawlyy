import { redirect } from '@/i18n/navigation';
import { formModule } from '@/src/server/forms/read';
import { getLocale, getTranslations } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { listForms, listSubmissions } from '@/src/server/forms/read';
import { firstParam, formPageGrants, toJson } from '@/src/server/forms/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { SendFormButton } from './action-dialog';
import type { FormKind, FormPage, ReviewQueue as Queue } from './contracts';
import { HubTabs } from './hub-tabs';
import { ReviewQueue } from './review-queue';
import { TemplateList } from './template-list';

/** Task 7: coach hub for one form kind: review queue and templates, with the send action. Shared by intake, check-ins and assessments. */
export async function FormHubPage({ formKind, search }: { formKind: FormKind; search: Record<string, string | string[] | undefined> }) {
  const auth = await requirePage();
  const t = await getTranslations('forms');
  const grants = formPageGrants(auth, formKind);
  const tab = firstParam(search.tab) === 'templates' || firstParam(search.archived) === 'true' ? 'templates' : 'review';
  const kind = firstParam(search.kind) === 'client' ? 'client' : 'template';
  const archived = firstParam(search.archived) === 'true';
  const q = firstParam(search.q)?.slice(0, 200) ?? '';
  const data = await withAuthTx(auth, async tx => {
    const sendable = await listForms(tx, auth, { formKind, kind: 'template', archived: 'false' });
    return {
      sendable: sendable.items.filter(item => item.publishedVersionId).map(item => ({ id: item.id, name: item.name })),
      page: tab === 'templates' ? await listForms(tx, auth, { formKind, kind, archived: archived ? 'true' : 'false', ...(q ? { q } : {}) }) : null,
      queue: tab === 'review' ? await listSubmissions(tx, auth, { formKind }) : null,
    };
  });
  const canReviewCheckins = formKind === 'checkin' && isAllowed(auth, formModule(formKind), 'review');
  if (canReviewCheckins && data.queue && firstParam(search.afterReview)) {
    const next = data.queue.items[0];
    if (next) redirect({ href: `/coach/checkins/review/${next.id}`, locale: await getLocale() });
  }
  return <div className="grid min-w-0 max-w-full gap-5 [overflow-wrap:anywhere]">
    <PageHeader title={t(`hub.title.${formKind}`)} subtitle={t(`hub.subtitle.${formKind}`)} />
    <div className="flex flex-wrap gap-2">{grants.create ? <SendFormButton formKind={formKind} templates={toJson(data.sendable)} label={t(`hub.send.${formKind}`)} /> : null}</div>
    <HubTabs formKind={formKind} active={tab} count={data.queue && !data.queue.nextCursor ? data.queue.items.length : undefined} />
    {tab === 'templates' && data.page
      ? <TemplateList key={JSON.stringify([kind, archived, q])} initial={toJson<FormPage>(data.page)} formKind={formKind} grants={grants} archiveCanEdit={isAllowed(auth, 'forms', 'edit')} filters={{ kind, archived, q }} />
      : data.queue ? <ReviewQueue canReviewCheckins={canReviewCheckins} initial={toJson<Queue>(data.queue)} formKind={formKind} /> : null}
  </div>;
}
