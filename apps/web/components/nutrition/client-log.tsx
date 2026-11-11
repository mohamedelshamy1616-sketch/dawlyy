'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import { useWriteQueue } from './retry-queue';

/** Task 6: free-text entry for an off-plan meal. The client UUID is fixed per entry so a repeated submit never duplicates it. */
export function ClientQuickEntry({ localDate }: { localDate: string }) {
  const t = useTranslations('nutrition'); const queue = useWriteQueue();
  const [text, setText] = useState(''); const [note, setNote] = useState(''); const [uuid, setUuid] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'queued' | 'error'>('idle');
  async function submit() {
    const trimmed = text.trim(); if (!trimmed) return; setState('busy');
    try {
      const result = await queue.send('/api/v1/meal-logs', { clientUuid: uuid, localDate, status: 'eaten', freeEntry: { text: trimmed }, ...(note.trim() ? { note: note.trim() } : {}), clientUpdatedAt: new Date().toISOString() });
      setState(result); setText(''); setNote(''); setUuid(crypto.randomUUID());
    } catch { setState('error'); }
  }
  return <VStack gap={4} width="100%" className="min-w-0 max-w-full [overflow-wrap:anywhere]">
    {state === 'sent' ? <Banner status="success" title={t('client.entrySaved')} /> : null}
    {state === 'queued' ? <Banner status="info" title={t('client.queued', { count: Math.max(queue.pending, 1) })} description={t('client.queuedHint')} /> : null}
    {state === 'error' ? <Banner status="error" title={t('errors.request')} /> : null}
    <TextArea label={t('client.entryText')} description={t('client.entryHint')} value={text} onChange={setText} rows={4} maxLength={4000} isRequired />
    <TextArea label={t('common.note')} value={note} onChange={setNote} rows={2} maxLength={4000} isOptional />
    <HStack gap={2} wrap="wrap">
      <Button size="lg" variant="primary" label={t('client.saveEntry')} isLoading={state === 'busy'} isDisabled={!text.trim()} onClick={() => void submit()} />
      <Button size="lg" variant="ghost" href="/app/nutrition" label={t('client.backToMeals')} />
    </HStack>
  </VStack>;
}
