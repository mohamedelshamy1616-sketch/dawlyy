'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Archive } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';
import { useUndoableAction, useUndoSnapshot } from '@/src/hooks/use-undoable-action';
import { archiveAction, calendarAction, errorKind, hideAction, type ArchiveEntity, type ControlErrorKind } from '@/src/lib/control/archive-transport';

type Reversible = { commit: () => Promise<unknown>; rollback: (receipt?: unknown) => Promise<void> };

/** R3a: one row action on the shared undo control: commit now, offer Undo for the window, refresh on every outcome. */
function useRowAction(onChanged?: () => void) {
  const router = useRouter();
  const { run, state } = useUndoableAction();
  const [error, setError] = useState<ControlErrorKind | null>(null);
  const mounted = useRef(true);
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; }, [onChanged]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // After an unmount the callbacks stay safe: they only call the latest refresh and never set state.
  const refresh = useCallback(() => { if (changed.current) changed.current(); else router.refresh(); }, [router]);
  const busy = state !== null && (state.phase === 'executing' || state.phase === 'undoing' || state.phase === 'committing');
  function start(label: string, action: Reversible) {
    setError(null);
    void run({ mode: 'immediate', label, commit: action.commit, rollback: action.rollback, onCommitted: refresh, onUndone: refresh,
      onError: cause => { if (mounted.current) setError(errorKind(cause)); refresh(); } });
  }
  return { start, busy, error };
}

/**
 * R3a: the undo slot is app-wide, so an Undo pressed after the list that started the action unmounted (a filter link,
 * a route change) would otherwise leave the list on screen stale. Each list calls this once with its own reload;
 * it fires whenever an action leaves executing, undoing or committing, whichever list started it.
 */
export function useReloadOnUndoSettle(reload: () => void) {
  const state = useUndoSnapshot();
  const latest = useRef(reload);
  const previous = useRef<typeof state>(null);
  useEffect(() => { latest.current = reload; });
  useEffect(() => {
    const busy = (value: typeof state) => value !== null && (value.phase === 'executing' || value.phase === 'undoing' || value.phase === 'committing');
    const before = previous.current; previous.current = state;
    if (busy(before) && !busy(state)) latest.current();
  }, [state]);
}

function RowButton({ label, ariaLabel, busy, error, onClick }: { label: string; ariaLabel: string; busy: boolean; error: ControlErrorKind | null; onClick: () => void }) {
  const t = useTranslations('archiveControls');
  return <VStack gap={1} className="min-w-0 max-w-full">
    <Button variant="ghost" className="min-h-11 min-w-11" isDisabled={busy} aria-label={ariaLabel} onClick={onClick} label={label} />
    {error ? <Text type="supporting" as="p" display="block" role="alert" className="!text-destructive break-words">{t(`errors.${error}`)}</Text> : null}
  </VStack>;
}

/**
 * R3a: Archive or Restore for one row of any of the six library lists, and for the client and nutrition detail
 * pages. Archive and Restore need that module's edit grant; the server enforces it, the button only hides itself.
 * Restoring a client always lands on inactive (setClientArchived), so the copy says so.
 */
export function ArchiveRowControl({ entity, id, archived, canEdit, itemLabel, onChanged }: { entity: ArchiveEntity; id: string; archived: boolean; canEdit: boolean; itemLabel: string; onChanged?: () => void }) {
  const t = useTranslations('archiveControls');
  const { start, busy, error } = useRowAction(onChanged);
  if (!canEdit) return null;
  const key = entity === 'clients' ? 'Client' : '';
  const toast = archived ? t(`toast.restored${key}`, { name: itemLabel }) : t(`toast.archived${key}`, { name: itemLabel });
  return <RowButton busy={busy} error={error} label={archived ? t('restore') : t('archive')} ariaLabel={archived ? t('restoreItem', { name: itemLabel }) : t('archiveItem', { name: itemLabel })}
    onClick={() => start(toast, archiveAction(entity, id, archived))} />;
}

/** R3a: foods and system exercises keep Hide and Unhide (their existing wording and endpoints), now with the same Undo. */
export function HideRowControl({ kind, id, hidden, canEdit, itemLabel, onChanged }: { kind: 'foods' | 'exercises'; id: string; hidden: boolean; canEdit: boolean; itemLabel: string; onChanged?: () => void }) {
  const t = useTranslations('archiveControls');
  const { start, busy, error } = useRowAction(onChanged);
  if (!canEdit) return null;
  return <RowButton busy={busy} error={error} label={hidden ? t('unhide') : t('hide')} ariaLabel={hidden ? t('unhideItem', { name: itemLabel }) : t('hideItem', { name: itemLabel })}
    onClick={() => start(hidden ? t('toast.unhidden', { name: itemLabel }) : t('toast.hidden', { name: itemLabel }), hideAction(kind, id, hidden))} />;
}

/** R3a: cancel a calendar event, or restore a cancelled one (restore is not reschedule). Needs calendar edit. */
export function CancelEventControl({ id, cancelled, canEdit, itemLabel, onChanged }: { id: string; cancelled: boolean; canEdit: boolean; itemLabel: string; onChanged?: () => void }) {
  const t = useTranslations('archiveControls');
  const { start, busy, error } = useRowAction(onChanged);
  if (!canEdit) return null;
  return <RowButton busy={busy} error={error} label={cancelled ? t('restoreEvent') : t('cancelEvent')} ariaLabel={cancelled ? t('restoreEventItem', { name: itemLabel }) : t('cancelEventItem', { name: itemLabel })}
    onClick={() => start(cancelled ? t('toast.eventRestored', { name: itemLabel }) : t('toast.eventCancelled', { name: itemLabel }), calendarAction(id, cancelled))} />;
}

/** R3a: the Active or Archived switch of a list. Give hrefFor for URL-backed filters, or onSelect for in-page ones. hidden swaps the wording for foods. */
export function ArchivedFilter({ archived, hrefFor, onSelect, hidden = false }: { archived: boolean; hrefFor?: (archived: boolean) => string; onSelect?: (archived: boolean) => void; hidden?: boolean }) {
  const t = useTranslations('archiveControls');
  const options = [{ value: false, label: hidden ? t('visibleFilter') : t('activeFilter') }, { value: true, label: hidden ? t('hiddenFilter') : t('archivedFilter') }];
  return <HStack gap={2} wrap="wrap" role="group" aria-label={t('filterLabel')}>
    {options.map(option => <Button key={String(option.value)} variant={archived === option.value ? 'primary' : 'secondary'} className="min-h-11 min-w-11"
      {...(hrefFor ? { 'aria-current': archived === option.value ? 'page' as const : undefined } : { 'aria-pressed': archived === option.value })}
      {...(hrefFor ? { href: hrefFor(option.value) } : {})} {...(onSelect ? { onClick: () => onSelect(option.value) } : {})} label={option.label} />)}
  </HStack>;
}

/** R3a: settled-empty state for an archived listing. */
export function ArchivedEmpty({ hidden = false }: { hidden?: boolean }) {
  const t = useTranslations('archiveControls');
  return <EmptyState Icon={Archive} title={hidden ? t('emptyHiddenTitle') : t('emptyArchivedTitle')} description={hidden ? t('emptyHiddenBody') : t('emptyArchivedBody')} />;
}