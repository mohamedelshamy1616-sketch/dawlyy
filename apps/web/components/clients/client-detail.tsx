'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { localize } from '@dawlyy/core/types';
import { History } from 'lucide-react';
import { ClientForm } from './client-form';
import { ClientStatus } from './client-list';
import { useMutation } from './use-mutation';
import { useRouter } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';

/** Task 3: profile, package, subscription handoff and the explicitly deferred Client 360 history tab. */
export function ClientDetail({ client, canEdit }: { client: NonNullable<Parameters<typeof ClientForm>[0]['initial']> & { status: 'lead' | 'active' | 'inactive' | 'archived'; activePackage: { ar?: string; en?: string } | null }; canEdit: boolean }) {
  const t = useTranslations('clients');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const router = useRouter();
  const mutation = useMutation();
  const id = useId();
  const [tab, setTab] = useState('profile');
  async function archive() {
    const result = await mutation.send(`/api/v1/clients/${client.id}/${client.status === 'archived' ? 'unarchive' : 'archive'}`, 'POST');
    if (result !== undefined) router.refresh();
  }
  return <VStack gap={5} className="min-w-0">
    <HStack wrap="wrap" align="center" gap={3}><ClientStatus value={client.status} />{canEdit ? <Button variant="secondary" className="min-h-11" isDisabled={mutation.pending} onClick={archive} label={t(client.status === 'archived' ? 'unarchive' : 'archive')} /> : null}</HStack>
    {mutation.error ? <Text type="supporting" as="p" display="block" role="alert" className="!text-destructive">{t(`errors.${mutation.error}`)}</Text> : null}
    <VStack gap={4} className="min-w-0">
      <TabList role="tablist" value={tab} onChange={setTab} className="min-w-0 max-w-full" hasDivider>
        {(['profile', 'package', 'subscription', 'history'] as const).map(value => <Tab key={value} id={`${id}-${value}-tab`} value={value} panelId={`${id}-${value}-panel`} className="min-h-11 whitespace-normal" onFocus={() => setTab(value)} label={t(`tabs.${value}`)} />)}
      </TabList>
      {tab === 'profile' ? <VStack role="tabpanel" id={`${id}-profile-panel`} aria-labelledby={`${id}-profile-tab`} tabIndex={0} className="min-w-0 py-4"><ClientForm key={client.id} initial={client} editable={canEdit} /></VStack> : <VStack hidden className="!hidden" role="tabpanel" id={`${id}-profile-panel`} aria-labelledby={`${id}-profile-tab`} tabIndex={0} />}
      {tab === 'package' ? <VStack role="tabpanel" id={`${id}-package-panel`} aria-labelledby={`${id}-package-tab`} tabIndex={0} gap={4} className="min-w-0 py-4"><Text weight="medium" as="p" display="block" className="break-words">{client.activePackage ? localize(client.activePackage, locale) : t('noPackage')}</Text><HStack wrap="wrap" gap={3}><Button className="min-h-11" href={`/coach/billing/sell?clientId=${client.id}`} variant="primary" label={t('sellPackage')} />{canEdit ? <Button variant="secondary" className="min-h-11" href={`/coach/clients/${client.id}/overrides`} label={t('overrides.title')} /> : null}</HStack></VStack> : <VStack hidden className="!hidden" role="tabpanel" id={`${id}-package-panel`} aria-labelledby={`${id}-package-tab`} tabIndex={0} />}
      {tab === 'subscription' ? <VStack role="tabpanel" id={`${id}-subscription-panel`} aria-labelledby={`${id}-subscription-tab`} tabIndex={0} className="py-4" align="start"><Button className="min-h-11" href={`/coach/clients/${client.id}/subscription`} variant="primary" label={t('subscriptionStatus')} /></VStack> : <VStack hidden className="!hidden" role="tabpanel" id={`${id}-subscription-panel`} aria-labelledby={`${id}-subscription-tab`} tabIndex={0} />}
      {tab === 'history' ? <VStack role="tabpanel" id={`${id}-history-panel`} aria-labelledby={`${id}-history-tab`} tabIndex={0} className="py-4"><EmptyState Icon={History} title={t('tabs.history')} description={t('history.soon')} /></VStack> : <VStack hidden className="!hidden" role="tabpanel" id={`${id}-history-panel`} aria-labelledby={`${id}-history-tab`} tabIndex={0} />}
    </VStack>
  </VStack>;
}
