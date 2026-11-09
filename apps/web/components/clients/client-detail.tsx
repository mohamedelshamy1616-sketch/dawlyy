'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localize } from '@dawlyy/core/types';
import { History } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/src/components/shell/empty-state';
import { ClientForm } from './client-form';
import { ClientStatus } from './client-list';
import { useMutation } from './use-mutation';

/** Task 3: profile, package, subscription handoff and the explicitly deferred Client 360 history tab. */
export function ClientDetail({ client, canEdit }: { client: NonNullable<Parameters<typeof ClientForm>[0]['initial']> & { status: 'lead' | 'active' | 'inactive' | 'archived'; activePackage: { ar?: string; en?: string } | null }; canEdit: boolean }) {
  const t = useTranslations('clients');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const router = useRouter();
  const mutation = useMutation();
  async function archive() {
    const result = await mutation.send(`/api/v1/clients/${client.id}/${client.status === 'archived' ? 'unarchive' : 'archive'}`, 'POST');
    if (result !== undefined) router.refresh();
  }
  return <div className="grid min-w-0 gap-5">
    <div className="flex flex-wrap items-center gap-3"><ClientStatus value={client.status} />{canEdit ? <Button variant="outline" className="min-h-11" disabled={mutation.pending} onClick={archive}>{t(client.status === 'archived' ? 'unarchive' : 'archive')}</Button> : null}</div>
    {mutation.error ? <p role="alert" className="text-sm text-destructive">{t(`errors.${mutation.error}`)}</p> : null}
    <Tabs defaultValue="profile" className="min-w-0"><TabsList className="!h-auto w-full flex-wrap justify-start gap-2 p-1">
      {(['profile', 'package', 'subscription', 'history'] as const).map(tab => <TabsTrigger key={tab} value={tab} className="min-h-11 whitespace-normal">{t(`tabs.${tab}`)}</TabsTrigger>)}
    </TabsList>
      <TabsContent value="profile" className="min-w-0 py-4"><ClientForm key={client.id} initial={client} editable={canEdit} /></TabsContent>
      <TabsContent value="package" className="grid gap-4 py-4"><p className="break-words font-medium">{client.activePackage ? localize(client.activePackage, locale) : t('noPackage')}</p><div className="flex flex-wrap gap-3"><Button asChild className="min-h-11"><Link href={`/coach/billing/sell?clientId=${client.id}`}>{t('sellPackage')}</Link></Button>{canEdit ? <Button asChild variant="outline" className="min-h-11"><Link href={`/coach/clients/${client.id}/overrides`}>{t('overrides.title')}</Link></Button> : null}</div></TabsContent>
      <TabsContent value="subscription" className="py-4"><Button asChild className="min-h-11"><Link href={`/coach/clients/${client.id}/subscription`}>{t('subscriptionStatus')}</Link></Button></TabsContent>
      <TabsContent value="history" className="py-4"><EmptyState Icon={History} title={t('tabs.history')} description={t('history.soon')} /></TabsContent>
    </Tabs>
  </div>;
}
