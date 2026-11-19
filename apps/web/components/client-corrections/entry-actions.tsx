'use client';

import { ClientModules } from '@dawlyy/core/types';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import { useClientModules } from '@/components/client-today/client-module-provider';
import { useUndoableAction } from '@/src/hooks/use-undoable-action';
import { correctionEligibility } from '@/src/lib/client-corrections/eligibility';
import { runCorrection } from '@/src/lib/client-corrections/correction-actions';
import { CorrectionError, correctionErrorKey, entryVoid, sendMutation } from '@/src/lib/client-corrections/transport';

type Operation = Parameters<typeof sendMutation>[0];
type Kind = 'meal' | 'measurement' | 'metric' | 'workout';

/** R3a owns the only timer and toast; callbacks only change a still-mounted view. */
export function useDeferredEntryMutation(onChanged: () => void, onPendingChange?: (pending: boolean) => void) {
  const { run } = useUndoableAction();
  const modules = useClientModules(); const router = useRouter();
  const mounted = useRef(true); const locked = useRef(false);
  const latest = useRef({ onChanged, onPendingChange });
  useEffect(() => { latest.current = { onChanged, onPendingChange }; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const foreground = () => { if (document.visibilityState === 'visible') latest.current.onChanged(); };
    document.addEventListener('visibilitychange', foreground);
    return () => document.removeEventListener('visibilitychange', foreground);
  }, []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReturnType<typeof correctionErrorKey> | null>(null);
  const [saved, setSaved] = useState(false); const [retryable, setRetryable] = useState(false);
  async function start(operation: Operation, label: string, onSettled?: () => void) {
    if (locked.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const error = new CorrectionError('offline', 0, false); setError('offline'); return { status: 'failed' as const, error };
    }
    locked.current = true; setError(null); setSaved(false); setRetryable(false);
    const result = await runCorrection({ run, label,
      commit: () => sendMutation(operation, { onModuleDisabled: async app => {
        if (!mounted.current) return;
        const context = typeof app === 'object' && app !== null ? app as { clientModules?: unknown; numerals?: unknown } : null;
        const parsed = ClientModules.safeParse(context?.clientModules);
        if (parsed.success && modules.userId) modules.seed({ userId: modules.userId, modules: parsed.data, numerals: context?.numerals === 'arab' ? 'arab' : 'latn' });
        else await modules.refresh();
        router.refresh();
      } }),
      optimistic: () => { setPending(true); latest.current.onPendingChange?.(true); },
      restore: () => { setPending(false); latest.current.onPendingChange?.(false); },
      onCommitted: () => { setPending(false); setSaved(true); onSettled?.(); },
      onError: cause => { setRetryable(cause instanceof CorrectionError && cause.retryable); setError(correctionErrorKey(cause)); },
      onChanged: () => { latest.current.onChanged(); router.refresh(); },
      isMounted: () => mounted.current,
    });
    locked.current = false;
    if (mounted.current && result?.status === 'undone') onSettled?.();
    return result;
  }
  return { start, pending, error, saved, retryable };
}

/** Unknown server timestamps never grant a correction action. */
export function EntryActions({ kind, id, createdAt, voidedAt, onEdit, onChanged, onPendingChange }: {
  kind: Kind; id: string; createdAt: string | null | undefined; voidedAt: string | null | undefined;
  onEdit?: () => void; onChanged: () => void; onPendingChange?: (pending: boolean) => void;
}) {
  const t = useTranslations('clientCorrections'); const { modules } = useClientModules();
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false); const [reason, setReason] = useState('');
  const operation = useRef<Operation | null>(null);
  const action = useDeferredEntryMutation(onChanged, onPendingChange);
  const enabled = kind === 'meal' ? modules?.nutrition : kind === 'workout' ? modules?.workouts : modules?.measurements;
  if (!enabled) return null;
  if (voidedAt) return <Text>{t('voided')}</Text>;
  if (!id) return <Text>{t('syncFirst')}</Text>;
  const eligibility = correctionEligibility(createdAt, now, voidedAt);
  if (!eligibility.eligible && !action.retryable) return <Text role="status">{t('unavailable')}</Text>;
  function remove() {
    if (reason.length > 500) return;
    if (!operation.current) operation.current = entryVoid(kind, id, reason.trim() || undefined, crypto.randomUUID());
    void action.start(operation.current, t('removedToast'), () => { operation.current = null; setOpen(false); }).then(result => {
      if (result?.status === 'failed' && result.error instanceof CorrectionError && !result.error.retryable) operation.current = null;
    });
  }
  return <VStack gap={2} className="min-w-0 max-w-full">
    <HStack gap={2} wrap="wrap">
      {onEdit ? <Button label={t('edit')} className="min-h-11" variant="secondary" isDisabled={action.pending} onClick={() => { setNow(Date.now()); if (correctionEligibility(createdAt, Date.now(), voidedAt).eligible) onEdit(); }} /> : null}
      <Button label={t(kind === 'workout' ? 'removeWorkout' : 'remove')} className="min-h-11" variant="secondary" isDisabled={action.pending} onClick={() => { setNow(Date.now()); setOpen(true); }} />
    </HStack>
    {action.pending ? <Text role="status">{t('pending')}</Text> : null}
    {action.saved ? <Text role="status">{t('saved')}</Text> : null}
    {action.error ? <Text role="alert">{t(action.error)}</Text> : null}
    <Dialog isOpen={open && !action.pending} onOpenChange={value => { if (!action.pending) setOpen(value); }} aria-label={t('remove')}>
      <VStack gap={4} className="min-w-0 max-w-full">
        <DialogHeader title={t('remove')} subtitle={t('removeHint')} />
        <TextArea label={t('reason')} value={reason} onChange={value => { if (!action.pending && !operation.current) setReason(value); }} maxLength={500} controlClassName="min-h-11" />
        {action.error ? <Text role="alert">{t(action.error)}</Text> : null}
        <HStack gap={2} wrap="wrap"><Button label={t(action.error ? 'retry' : 'remove')} className="min-h-11" isDisabled={action.pending || reason.length > 500} onClick={remove} /><Button label={t('cancel')} variant="secondary" className="min-h-11" isDisabled={action.pending} onClick={() => { operation.current = null; setOpen(false); }} /></HStack>
      </VStack>
    </Dialog>
  </VStack>;
}
