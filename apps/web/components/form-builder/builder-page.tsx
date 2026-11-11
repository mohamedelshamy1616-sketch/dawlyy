import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { localize } from '@dawlyy/core/types';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getForm } from '@/src/server/forms/read';
import { formPageGrants, missingAsNotFound, toJson } from '@/src/server/forms/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { FormBuilder } from './builder';
import type { FormDetail, FormKind } from './contracts';

/** Task 7: request-scoped snapshot initialises the builder; shared by the intake, check-in and assessment routes. */
export async function FormBuilderPage({ formKind, formId, locale }: { formKind: FormKind; formId: string; locale: string }) {
  const auth = await requirePage();
  const t = await getTranslations('forms');
  if (!z.uuid().safeParse(formId).success) notFound();
  const grants = formPageGrants(auth, formKind);
  const data = await withAuthTx(auth, tx => getForm(tx, auth, formId)).catch(missingAsNotFound);
  if (data.head.formKind !== formKind) notFound();
  const initial = toJson<FormDetail>(data);
  return <div className="grid min-w-0 max-w-full gap-5 [overflow-wrap:anywhere]">
    <PageHeader title={localize(data.head.name, locale === 'ar' ? 'ar' : 'en') || t('builder.title')} subtitle={t(`builder.subtitle.${data.head.kind}`)} />
    <FormBuilder key={initial.revision} initial={initial} grants={grants} />
  </div>;
}
