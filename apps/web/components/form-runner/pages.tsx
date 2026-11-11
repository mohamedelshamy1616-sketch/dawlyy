import { getTranslations } from 'next-intl/server';
import { localize } from '@dawlyy/core/types';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { clientEvents, clientFormForEvent, clientIntake } from '@/src/server/forms/read';
import { missingAsNotFound, requestTime, toJson } from '@/src/server/forms/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { z } from 'zod';
import { notFound } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { EmptyState } from '@/src/components/shell/empty-state';
import type { FormBundle, FormEventPage } from './contracts';
import { EventList } from './event-list';
import { FormRunner } from './runner';

/** Task 7: client list of due, upcoming and past check-ins or assessments. */
export async function ClientEventListPage({ formKind, basePath }: { formKind: 'checkin' | 'assessment'; basePath: string }) {
  const auth = await requirePage();
  const t = await getTranslations('forms');
  const data = await withAuthTx(auth, tx => clientEvents(tx, auth, { formKind }));
  return <div className="grid min-w-0 max-w-full gap-5 [overflow-wrap:anywhere]">
    <PageHeader title={t(`client.title.${formKind}`)} subtitle={t(`client.subtitle.${formKind}`)} />
    <EventList initial={toJson<FormEventPage>(data)} formKind={formKind} basePath={basePath} now={requestTime()} />
  </div>;
}

/** Task 7: client runner for one calendar event; the pinned form version is resolved by the service. */
export async function ClientRunnerPage({ eventId, formKind, locale }: { eventId: string; formKind: 'checkin' | 'assessment'; locale: string }) {
  const auth = await requirePage();
  const t = await getTranslations('forms');
  if (!z.uuid().safeParse(eventId).success) notFound();
  const data = await withAuthTx(auth, tx => clientFormForEvent(tx, auth, eventId)).catch(missingAsNotFound);
  if (data.event.type !== formKind) notFound();
  const bundle = toJson<FormBundle>(data);
  return <div className="grid min-w-0 max-w-full gap-5 [overflow-wrap:anywhere]">
    <PageHeader title={localize(data.head.name, locale === 'ar' ? 'ar' : 'en') || t(`client.defaultTitle.${formKind}`)} subtitle={t(`client.runnerSubtitle.${formKind}`)} />
    <FormRunner bundle={bundle} />
  </div>;
}

/** Task 7: client intake; one submission per client and published intake version. */
export async function ClientIntakePage({ locale }: { locale: string }) {
  const auth = await requirePage();
  const t = await getTranslations('forms');
  const data = await withAuthTx(auth, tx => clientIntake(tx, auth));
  return <div className="grid min-w-0 max-w-full gap-5 [overflow-wrap:anywhere]">
    <PageHeader title={data ? localize(data.head.name, locale === 'ar' ? 'ar' : 'en') || t('client.intakeTitle') : t('client.intakeTitle')} subtitle={t('client.intakeSubtitle')} />
    {data ? <FormRunner bundle={toJson<FormBundle>(data)} /> : <EmptyState Icon={ClipboardList} title={t('client.intakeEmptyTitle')} description={t('client.intakeEmptyDescription')} />}
  </div>;
}
