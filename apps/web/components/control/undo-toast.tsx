'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { useUndoSnapshot } from '@/src/hooks/use-undoable-action';
import { undoStore, type UndoSnapshot } from '@/src/lib/control/undo-store';

/**
 * R3a: the presentational toast. It takes the snapshot as a prop so every phase can be rendered in a test; the
 * connected UndoToast below feeds it from the app-wide store.
 */
export function UndoToastView({ state, onUndo, onClose }: { state: UndoSnapshot | null; onUndo: () => void; onClose: () => void }) {
  const t = useTranslations('controlUndo');
  const message = !state ? '' : state.phase === 'executing' ? t('executing') : state.phase === 'undoing' ? t('undoing')
    : state.phase === 'committing' ? t('committing') : state.phase === 'failed'
      ? t(state.mode === 'deferred' ? 'saveFailed' : 'failed', { label: state.label }) : state.label;
  const working = state !== null && (state.phase === 'executing' || state.phase === 'undoing' || state.phase === 'committing');
  return <>
    {/* One persistent polite live region: its text changes only when the phase or label changes, never on a timer. */}
    <Text as="p" role="status" aria-live="polite" aria-atomic="true" className="sr-only">{message}</Text>
    {state ? <Card role="group" aria-label={t('region')} data-undo-toast="" data-phase={state.phase} padding={3} className="fixed inset-x-4 bottom-20 z-50 mx-auto min-w-0 max-w-md md:bottom-4">
      <HStack gap={2} wrap="wrap" align="center" justify="between" className="min-w-0">
        <Text as="p" display="block" className="min-w-0 flex-1 break-words">{message}</Text>
        <HStack gap={2} wrap="wrap" className="min-w-0">
          {state.phase === 'executing' || state.phase === 'committing' ? null
            : <Button variant="primary" className="min-h-11 min-w-11" isDisabled={working} onClick={onUndo} label={state.phase === 'failed' ? t(state.mode === 'deferred' ? 'retrySave' : 'retry') : t('undo')} />}
          {state.phase === 'undoable' || state.phase === 'failed'
            ? <Button variant="ghost" className="min-h-11 min-w-11" onClick={onClose} label={state.mode === 'deferred' && state.phase === 'undoable' ? t('keep') : t('close')} /> : null}
        </HStack>
      </HStack>
    </Card> : null}
  </>;
}

/** R3a: the single toast, mounted once by the locale layout. Lists never render their own. */
export function UndoToast() {
  const state = useUndoSnapshot();
  return <UndoToastView state={state} onUndo={() => { void undoStore.undo(); }} onClose={() => { void undoStore.dismiss(); }} />;
}