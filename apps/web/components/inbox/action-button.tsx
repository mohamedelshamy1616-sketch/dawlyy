'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { useRouter } from '@/i18n/navigation';
import type { InboxItem } from './types';

/** R1b: a nudge/reply without a thread opens one through the existing authenticated API. */
export function InboxAction({ item }: { item: InboxItem }) {
  const t = useTranslations('inbox'); const router = useRouter(); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  async function openConversation() {
    if (busy) return;
    setBusy(true); setFailed(false);
    try {
      const response = await fetch('/api/v1/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ clientId: item.client.id }) });
      if (!response.ok) throw new Error('conversation');
      const { id } = z.object({ id: z.uuid() }).parse(await response.json());
      router.push(`/coach/messages/${id}`);
    } catch { setFailed(true); setBusy(false); }
  }
  return <VStack gap={1} className="shrink-0">
    <Button label={t(`actions.${item.primaryAction}`)} variant="secondary" className="min-h-11"
      href={item.actionHref ?? undefined} isDisabled={busy} onClick={item.actionHref ? undefined : () => void openConversation()} />
    {failed ? <Text type="supporting" size="xsm" role="alert">{t('actionError')}</Text> : null}
  </VStack>;
}
