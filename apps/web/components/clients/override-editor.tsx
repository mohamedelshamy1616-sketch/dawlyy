'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { entitlementId } from '@dawlyy/core/entitlements';
import type { Entitlement } from '@dawlyy/core/types';
import type { entitlementDisplay } from '@/src/server/clients/models';
import { EntitlementFields } from '@/components/packages/entitlement-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { useMutation } from './use-mutation';

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
  return <div className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-center gap-2">{initial.overridden ? <Badge>{t('overrides.overridden')}</Badge> : <Badge variant="secondary">{t('overrides.packageValue')}</Badge>}
      {initial.customKey ? <span className="break-words text-sm">{initial.customKey}</span> : null}
    </div>
    <EntitlementFields value={value} onChange={setValue} disabled={!editable || mutation.pending} />
    <div className="flex flex-wrap gap-2">{editable ? <Button className="min-h-11" disabled={mutation.pending} onClick={() => save(false)}>{t(mutation.pending ? 'saving' : 'save')}</Button> : null}
      {editable && initial.source === 'override' ? <Button variant="outline" className="min-h-11" disabled={mutation.pending} onClick={() => save(true)}>{t('overrides.reset')}</Button> : null}
    </div>
    {mutation.error ? <p role="alert" className="text-sm text-destructive">{t(`errors.${mutation.error}`)}</p> : null}
    {mutation.saved ? <p role="status" className="text-sm">{t('saved')}</p> : null}
  </div>;
}

/** Task 3: client-scoped entitlement edits, explicit reset and visible package differences. */
export function OverrideEditor({ clientId, resolved, editable }: { clientId: string; resolved: DisplayRow[]; editable: boolean }) {
  const t = useTranslations('clients');
  return <div className="grid min-w-0 gap-6">
    <p className="text-sm text-muted-foreground">{t('overrides.hint')}</p>
    {!editable ? <p className="text-sm text-muted-foreground">{t('overrides.billingPermission')}</p> : null}
    {resolved.map(row => <OverrideRow key={`${entitlementId(row)}:${JSON.stringify(row)}`} initial={row} clientId={clientId} editable={editable} />)}
  </div>;
}
