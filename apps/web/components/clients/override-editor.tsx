'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { entitlementId } from '@dawlyy/core/entitlements';
import type { Entitlement } from '@dawlyy/core/types';
import { SlidersHorizontal } from 'lucide-react';
import { useMutation } from './use-mutation';
import { EntitlementFields } from '@/components/packages/entitlement-fields';
import { Link, useRouter } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';
import type { entitlementDisplay } from '@/src/server/clients/models';

type DisplayRow = ReturnType<typeof entitlementDisplay>[number];

function OverrideRow({ initial, clientId, editable }: { initial: DisplayRow; clientId: string; editable: boolean }) {
  const t = useTranslations('clients');
  const [value, setValue] = useState<Entitlement>(initial);
  const mutation = useMutation();
  const router = useRouter();
  const id = entitlementId(initial);
  async function save(reset: boolean) {
    const { enabled, frequency, limit, durationDays, turnaroundHours, mediaTypes, note } = value;
    const result = await mutation.send(`/api/v1/clients/${clientId}/overrides/${encodeURIComponent(id)}`, reset ? 'DELETE' : 'PUT',
      reset ? undefined : { enabled, frequency, limit, durationDays, turnaroundHours, mediaTypes, note });
    if (result !== undefined) router.refresh();
  }
  return <VStack gap={3} className="min-w-0">
    <HStack wrap="wrap" align="center" gap={2}><Text type="supporting" weight="medium">{t(initial.overridden ? 'overrides.overridden' : 'overrides.packageValue')}</Text>
      {initial.customKey ? <Text type="supporting" className="break-words">{initial.customKey}</Text> : null}
    </HStack>
    <EntitlementFields value={value} onChange={setValue} disabled={!editable || mutation.pending} />
    <HStack wrap="wrap" gap={2}>{editable ? <Button className="min-h-11" isDisabled={mutation.pending} onClick={() => save(false)} variant="primary" label={t(mutation.pending ? 'saving' : 'save')} /> : null}
      {editable && initial.source === 'override' ? <Button variant="secondary" className="min-h-11" isDisabled={mutation.pending} onClick={() => save(true)} label={t('overrides.reset')} /> : null}
    </HStack>
    {mutation.error ? <Text type="supporting" as="p" display="block" role="alert" className="!text-destructive">{t(`errors.${mutation.error}`)}</Text> : null}
    {mutation.saved ? <Text type="supporting" as="p" display="block" role="status" >{t('saved')}</Text> : null}
  </VStack>;
}

/** Task 3: client-scoped entitlement edits, explicit reset and visible package differences. */
export function OverrideEditor({ clientId, resolved, editable }: { clientId: string; resolved: DisplayRow[]; editable: boolean }) {
  const t = useTranslations('clients');
  return <VStack gap={6} className="min-w-0">
    <Text type="supporting" as="p" display="block">{t('overrides.hint')}</Text>
    {!editable ? <Text type="supporting" as="p" display="block">{t('overrides.billingPermission')}</Text> : null}
    {resolved.map(row => <OverrideRow key={`${entitlementId(row)}:${JSON.stringify(row)}`} initial={row} clientId={clientId} editable={editable} />)}
  </VStack>;
}

/** P5 group C: client boundary for the server overrides page's Astryx frame and empty action. */
export function ClientOverridesPageContent({ clientId, header, children }: { clientId: string; header: ReactNode; children: ReactNode }) {
  const t = useTranslations('clients');
  return <VStack gap={6} className="min-w-0 max-w-full break-words">
    {header}
    <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${clientId}`}>{t('backToClient')}</Link>
    {children ?? <EmptyState Icon={SlidersHorizontal} title={t('overrides.emptyTitle')} description={t('overrides.emptyBody')}
      action={<Button className="min-h-11" variant="primary" href={`/coach/billing/sell?clientId=${clientId}`} label={t('sellPackage')} />} />}
  </VStack>;
}
