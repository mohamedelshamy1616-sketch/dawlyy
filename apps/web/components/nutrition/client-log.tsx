'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import { useWriteQueue } from './retry-queue';
import { useClientModules } from '@/components/client-today/client-module-provider';
import { useRouter } from '@/i18n/navigation';
import { NutritionRequestError } from './transport';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';

/** Task 6: free-text entry for an off-plan meal. The client UUID is fixed per entry so a repeated submit never duplicates it. */
export function ClientQuickEntry({ localDate }: { localDate: string }) {
  const t = useTranslations('nutrition'); const q = useTranslations('quickLog'); const queue = useWriteQueue(); const modules = useClientModules(); const router = useRouter();
  const mounted = useRef(false); const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [text, setText] = useState(''); const [note, setNote] = useState(''); const [uuid, setUuid] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'queued' | 'error'>('idle');
  async function submit() {
    const trimmed = text.trim(); if (!trimmed || busy.current || !modules.modules?.nutrition) return; busy.current = true; setState('busy');
    try {
      const result = await queue.send('/api/v1/meal-logs', { clientUuid: uuid, localDate, status: 'eaten', freeEntry: { text: trimmed }, ...(note.trim() ? { note: note.trim() } : {}), clientUpdatedAt: new Date().toISOString() });
      if (!mounted.current) return;
      setState(result); setText(''); setNote(''); setUuid(crypto.randomUUID());
    } catch (error) { if (mounted.current) setState('error'); if (error instanceof NutritionRequestError && error.code === 'module_disabled') { await modules.refresh(); router.refresh(); } }
    finally { busy.current = false; }
  }
  if (modules.status === 'loading') return <Text role="status">{q('moduleLoading')}</Text>;
  if (modules.status === 'error') return <Button size="lg" className="min-h-11" label={q('retry')} onClick={() => void modules.refresh()} />;
  if (!modules.modules?.nutrition) return null;
  return <VStack gap={4} width="100%" className="min-w-0 max-w-full break-words">
    <Heading level={2} type="display-3">{q('freeEntry')}</Heading>
    {state === 'sent' ? <Banner status="success" title={t('client.entrySaved')} /> : null}
    {state === 'queued' ? <Banner status="info" title={t('client.queued', { count: Math.max(queue.pending, 1) })} description={t('client.queuedHint')} /> : null}
    {state === 'error' ? <Banner status="error" title={t('errors.request')} /> : null}
    <TextArea controlClassName="min-h-11" label={t('client.entryText')} description={t('client.entryHint')} value={text} onChange={setText} rows={4} maxLength={4000} isRequired />
    <TextArea controlClassName="min-h-11" label={t('common.note')} value={note} onChange={setNote} rows={2} maxLength={4000} isOptional />
    <HStack gap={2} wrap="wrap">
      <Button size="lg" className="min-h-11" variant="primary" label={t('client.saveEntry')} isLoading={state === 'busy'} isDisabled={!text.trim() || state === 'busy'} onClick={() => void submit()} />
      <Button size="lg" className="min-h-11" variant="ghost" href="/app/nutrition" label={t('client.backToMeals')} />
    </HStack>
  </VStack>;
}
