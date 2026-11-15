'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { HStack } from '@astryxdesign/core/HStack';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { localize } from '@dawlyy/core/types';
import { Link } from '@/i18n/navigation';
import { useUndoableAction } from '@/src/hooks/use-undoable-action';
import { assignmentClientsPath, listUrl, type ArchiveEntity } from '@/src/lib/control/archive-transport';
import {
  allVisibleSelected, archiveSender, assignSender, canAssign, createBulkUndo, emptySelection, pruneSelection, retryFailures, reverseSender, runAssignments, runBulk, selectVisible, summarize, toggleSelected,
  type AssignClient, type AssignRun, type BulkItem, type BulkOp, type BulkReceipt,
} from '@/src/lib/control/bulk-actions';
import { formatNumber, numberLocale, numeralPolicy, type NumeralSystem } from '@/src/lib/numbers';

/* One shared read of the saved numeral preference for the whole page, not one per row. */
let numeralsRead: Promise<NumeralSystem> | null = null;
function readNumerals(): Promise<NumeralSystem> {
  numeralsRead ??= fetch('/api/v1/me/app', { credentials: 'same-origin', cache: 'no-store' })
    .then(response => (response.ok ? response.json() : null)).then(body => numeralPolicy(body)).catch(() => 'latn' as NumeralSystem);
  return numeralsRead;
}
/** The user's numeral policy: Western digits until the saved preference is read. */
export function useNumerals(override?: NumeralSystem): NumeralSystem {
  const [numerals, setNumerals] = useState<NumeralSystem>(override ?? 'latn');
  useEffect(() => { if (override) return; let live = true; void readNumerals().then(value => { if (live) setNumerals(value); }); return () => { live = false; }; }, [override]);
  return override ?? numerals;
}

/** Selection over the rows that are loaded right now. A change of resetKey (any filter, search or kind) clears it. */
export function useBulkSelection(items: readonly BulkItem[], resetKey: string) {
  const [state, setState] = useState<{ key: string; ids: ReadonlySet<string> }>({ key: resetKey, ids: emptySelection() });
  const selected = state.key === resetKey ? pruneSelection(state.ids, items) : emptySelection();
  const set = (ids: ReadonlySet<string>) => setState({ key: resetKey, ids });
  return {
    selected, set,
    toggle: (id: string) => set(toggleSelected(selected, id)),
    selectAll: () => set(selectVisible(items)),
    clear: () => set(emptySelection()),
    allSelected: allVisibleSelected(selected, items),
  };
}

/** The header checkbox: selects the loaded, eligible rows only. */
export function BulkSelectAll({ items, selected, onChange }: { items: readonly BulkItem[]; selected: ReadonlySet<string>; onChange: (all: boolean) => void }) {
  const t = useTranslations('archiveControls');
  const all = allVisibleSelected(selected, items);
  const eligible = items.some(item => item.canEdit !== false);
  return <CheckboxInput className="min-h-11 min-w-11" label={t('bulk.selectAll')} value={all ? true : selected.size > 0 ? 'indeterminate' : false} isDisabled={!eligible} onChange={checked => onChange(checked)} />;
}
/** One row's checkbox; the visible label is the row's name for screen readers. */
export function BulkRowCheckbox({ item, selected, onToggle }: { item: BulkItem; selected: boolean; onToggle: () => void }) {
  const t = useTranslations('archiveControls');
  return <CheckboxInput className="min-h-11 min-w-11" isLabelHidden label={t('bulk.selectRow', { name: item.name })} value={selected} isDisabled={item.canEdit === false} onChange={onToggle} />;
}

/** The outcome of a bulk run. A partial result reads as partial: counts, the names that failed, and a retry for only those. */
export function BulkResultView({ receipt, busy, numerals, onRetry, onDismiss }: { receipt: BulkReceipt; busy: boolean; numerals?: NumeralSystem; onRetry: () => void; onDismiss: () => void }) {
  const t = useTranslations('archiveControls');
  const locale = numberLocale(useLocale());
  const count = (value: number) => formatNumber(value, { locale, numerals: numerals ?? 'latn', maximumFractionDigits: 0 });
  const summary = summarize(receipt);
  return <VStack gap={2} className="min-w-0" role="status">
    <Text as="p" display="block" weight="medium">{summary.outcome === 'success' ? t('bulk.result.success', { changed: count(summary.changed) })
      : summary.outcome === 'partial' ? t('bulk.result.partial', { changed: count(summary.changed), failed: count(summary.failed) })
        : summary.outcome === 'failed' ? t('bulk.result.failed', { failed: count(summary.failed) }) : t('bulk.result.nothing')}</Text>
    {summary.skipped ? <Text type="supporting" as="p" display="block">{t('bulk.result.skipped', { count: count(summary.skipped) })}</Text> : null}
    {summary.blocked ? <Text type="supporting" as="p" display="block">{t('bulk.result.blocked', { count: count(summary.blocked) })}</Text> : null}
    {receipt.failures.length ? <VStack gap={1} className="min-w-0">
      <Text type="supporting" as="p" display="block">{t('bulk.failedHeading')}</Text>
      {receipt.failures.map(failure => <Text key={failure.item.id} as="p" display="block" className="break-words">{failure.item.name} · {t(`errors.${failure.kind}`)}</Text>)}
      <HStack gap={2} wrap="wrap"><Button variant="secondary" className="min-h-11 min-w-11" isDisabled={busy} onClick={onRetry} label={t('bulk.retry')} />
        <Button variant="ghost" className="min-h-11 min-w-11" onClick={onDismiss} label={t('bulk.dismiss')} /></HStack>
    </VStack> : <HStack><Button variant="ghost" className="min-h-11 min-w-11" onClick={onDismiss} label={t('bulk.dismiss')} /></HStack>}
  </VStack>;
}

/**
 * R3a: the bar above a list while rows are selected. Archive or Restore runs the existing per-id endpoints one after
 * another; the receipt it returns is what the shared Undo reverses, so rows that failed or were already in the
 * destination state are never touched. A partial result is shown as partial, with the failed names and a retry.
 */
export function BulkBar({ entity, items, selected, archivedView, onSelectionChange, onChanged, numerals, extra }: {
  entity: ArchiveEntity; items: readonly BulkItem[]; selected: ReadonlySet<string>; archivedView: boolean;
  onSelectionChange: (ids: ReadonlySet<string>) => void; onChanged: () => void; numerals?: NumeralSystem; extra?: React.ReactNode;
}) {
  const t = useTranslations('archiveControls');
  const locale = numberLocale(useLocale());
  const policy = useNumerals(numerals);
  const { run, state } = useUndoableAction();
  const [receipt, setReceipt] = useState<BulkReceipt | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const op: BulkOp = archivedView ? 'restore' : 'archive';
  const busy = state !== null && (state.phase === 'executing' || state.phase === 'undoing' || state.phase === 'committing');
  const count = (value: number) => formatNumber(value, { locale, numerals: policy, maximumFractionDigits: 0 });

  function start(kind: BulkOp, base: BulkReceipt | null) {
    let latest: BulkReceipt | null = null; let undo: (() => Promise<unknown>) | null = null;
    void run<BulkReceipt>({ mode: 'immediate', label: kind === 'archive' ? t('bulk.toastArchive') : t('bulk.toastRestore'),
      commit: async () => {
        if (base) {
          const merged = await retryFailures(base, archiveSender(entity, kind));
          latest = merged;
          if (merged.changed.length === base.changed.length) throw merged.failures[0]?.error ?? new Error('nothing changed');
          return merged;
        }
        latest = await runBulk({ op: kind, items, selected, send: archiveSender(entity, kind) });
        if (latest.changed.length === 0 && latest.failures.length) throw latest.failures[0]!.error;
        return latest;
      },
      // Undo reverses only the rows this run changed; a retry's Undo covers only the rows the retry changed.
      rollback: async value => {
        undo ??= createBulkUndo(base ? { ...value, changed: value.changed.slice(base.changed.length) } : value, reverseSender(entity, kind));
        await undo();
      },
      onCommitted: value => { if (mounted.current) { setReceipt(value); onSelectionChange(new Set(value.failures.map(failure => failure.item.id))); } onChanged(); },
      onUndone: () => { if (mounted.current) { setReceipt(null); onSelectionChange(emptySelection()); } onChanged(); },
      onError: () => { if (mounted.current && latest) setReceipt(latest); onChanged(); } });
  }

  if (selected.size === 0 && !receipt) return null;
  return <Card padding={3} className="min-w-0 max-w-full" aria-label={t('bulk.region')} role="region"><VStack gap={3} className="min-w-0">
    {selected.size > 0 ? <>
      <HStack gap={2} wrap="wrap" align="center" className="min-w-0">
        <Text weight="medium" as="p">{t('bulk.selected', { count: count(selected.size) })}</Text>
        <Button variant="secondary" className="min-h-11 min-w-11" isDisabled={busy} onClick={() => { onSelectionChange(emptySelection()); }} label={t('bulk.clear')} />
        <Button variant="primary" className="min-h-11 min-w-11" isDisabled={busy} onClick={() => start(op, null)} label={op === 'archive' ? t('bulk.archiveSelected') : t('bulk.restoreSelected')} />
        {extra}
      </HStack>
      <Text type="supporting" as="p" display="block">{t('bulk.loadedOnly')}</Text>
    </> : null}
    {receipt ? <BulkResultView receipt={receipt} busy={busy} numerals={policy} onRetry={() => start(receipt.op, receipt)} onDismiss={() => setReceipt(null)} /> : null}
  </VStack></Card>;
}

/* ---------------- assigning one program to many clients ---------------- */

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}
type Template = { id: string; name: { ar?: string; en?: string } };
type Page<T> = { items: T[]; nextCursor: string | null };
type Grants = { edit: boolean; publish: boolean };

/** Results and the per-client Replace consent, shared by both assignment panels. Never publishes unless the coach asks and holds the grant. */
function AssignRunner({ programId, clients, grants, onFinished }: { programId: string; clients: readonly AssignClient[]; grants: Grants; onFinished?: () => void }) {
  const t = useTranslations('archiveControls');
  const locale = numberLocale(useLocale());
  const policy = useNumerals();
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<AssignRun | null>(null);
  const count = (value: number) => formatNumber(value, { locale, numerals: policy, maximumFractionDigits: 0 });
  const allowed = canAssign(grants, publish);
  async function go(targets: readonly AssignClient[], replaceIds?: ReadonlySet<string>) {
    setBusy(true);
    try {
      const next = await runAssignments({ programId, clients: targets, publish, canPublish: grants.publish, replaceIds, previous: run ?? undefined, send: assignSender() });
      // Keep earlier outcomes for clients not re-run in this pass.
      setRun({ keys: next.keys, results: [...(run?.results ?? []).filter(old => !next.results.some(fresh => fresh.clientId === old.clientId)), ...next.results] });
      onFinished?.();
    } finally { setBusy(false); }
  }
  const results = run?.results ?? [];
  const assigned = results.filter(result => result.status === 'assigned').length;
  const pending = results.filter(result => result.status === 'needs_replace').length;
  const failed = results.filter(result => result.status === 'failed').length;
  return <VStack gap={3} className="min-w-0">
    <Text type="supporting" as="p" display="block">{t('assign.notice')}</Text>
    <Switch className="min-h-11" label={t('assign.publishNow')} labelPosition="start" labelSpacing="spread" value={publish && grants.publish} isDisabled={!grants.publish || busy} onChange={setPublish} />
    {!allowed ? <Text type="supporting" as="p" display="block" role="alert">{t('errors.forbidden')}</Text> : null}
    <HStack gap={2} wrap="wrap">
      <Button variant="primary" className="min-h-11 min-w-11" isDisabled={busy || !allowed || clients.length === 0 || results.length > 0} onClick={() => void go(clients)} label={busy ? t('assign.running') : t('assign.run', { count: count(clients.length) })} />
    </HStack>
    {run ? <VStack gap={2} className="min-w-0" role="status">
      <Text as="p" display="block" weight="medium">{t('assign.summary', { assigned: count(assigned), pending: count(pending), failed: count(failed) })}</Text>
      {results.map(result => <VStack key={result.clientId} gap={1} className="min-w-0">
        {result.status === 'assigned' ? <HStack gap={2} wrap="wrap" align="center" className="min-w-0"><Text as="p" className="min-w-0 break-words">{t('assign.assigned', { name: result.name })}</Text>
          {result.copyId ? <Link href={`/coach/programs/${result.copyId}`} className="inline-flex min-h-11 items-center underline">{t('assign.openCopy')}</Link> : null}</HStack> : null}
        {result.status === 'needs_replace' ? <><Text as="p" display="block" className="break-words">{t('assign.needsReplace', { name: result.name })}</Text>
          <HStack><Button variant="secondary" className="min-h-11 min-w-11" isDisabled={busy || !allowed} onClick={() => void go([{ id: result.clientId, name: result.name }], new Set([result.clientId]))} label={t('assign.replace', { name: result.name })} /></HStack></> : null}
        {result.status === 'failed' ? <Text as="p" display="block" role="alert" className="break-words">{t('assign.failedFor', { name: result.name, reason: t(`errors.${result.kind}`) })}</Text> : null}
      </VStack>)}
    </VStack> : null}
  </VStack>;
}

/** Clients list: the selected clients get one published template, chosen here. */
export function AssignTemplateToSelected({ clients, grants }: { clients: readonly AssignClient[]; grants: Grants }) {
  const t = useTranslations('archiveControls');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<Template | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // The loading and error resets happen in the handlers that open the panel or retry (react-hooks/set-state-in-effect).
    if (!open) return; let live = true;
    getJson(listUrl('programs', { kind: 'template', limit: '50' }, false)).then(raw => {
      const page = raw as Page<Template & { publishedVersionNo: number | null; archivedAt: string | null }>;
      if (live) setTemplates(page.items.filter(item => item.publishedVersionNo !== null && !item.archivedAt));
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [open, attempt]);
  if (!(grants.edit || grants.publish)) return null;
  return <VStack gap={2} className="min-w-0 max-w-full">
    <Button variant="secondary" className="min-h-11 min-w-11" aria-expanded={open} onClick={() => { if (!open) { setFailed(false); setTemplates(null); } setOpen(!open); }} label={t('assign.title')} />
    {open ? <Card padding={3} className="min-w-0"><VStack gap={3} className="min-w-0">
      <Text weight="medium" as="p">{t('assign.pickTemplate')}</Text>
      {templates === null && !failed ? <Text role="status" as="p">{t('assign.loading')}</Text> : null}
      {failed ? <VStack gap={2}><Text role="alert" as="p">{t('errors.failed')}</Text><HStack><Button variant="secondary" className="min-h-11 min-w-11" onClick={() => { setFailed(false); setTemplates(null); setAttempt(value => value + 1); }} label={t('assign.retryLoad')} /></HStack></VStack> : null}
      {templates && templates.length === 0 ? <Text as="p">{t('assign.none')}</Text> : null}
      {templates?.map(template => <Button key={template.id} className="h-auto min-h-11 min-w-11 justify-start whitespace-normal text-start" variant={chosen?.id === template.id ? 'primary' : 'secondary'} aria-pressed={chosen?.id === template.id} onClick={() => setChosen(template)} label={localize(template.name, locale)} />)}
      {chosen ? <AssignRunner key={chosen.id} programId={chosen.id} clients={clients} grants={grants} /> : null}
    </VStack></Card> : null}
  </VStack>;
}

/** Programs list: one published template, then any number of the clients the assignment search offers. */
export function AssignClientsToTemplate({ programId, grants }: { programId: string; grants: Grants }) {
  const t = useTranslations('archiveControls');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [clients, setClients] = useState<Array<{ id: string; firstName: string; lastName: string | null; displayName: string | null; code: string }>>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<ReadonlyMap<string, AssignClient>>(new Map());
  const [attempt, setAttempt] = useState(0);
  const name = (client: { firstName: string; lastName: string | null; displayName: string | null }) => client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ');
  useEffect(() => {
    // The loading and error resets happen in the handlers that open the panel, change the search or retry (react-hooks/set-state-in-effect).
    if (!open) return; let live = true;
    const timer = setTimeout(() => {
      getJson(assignmentClientsPath(programId, { q })).then(raw => { const page = raw as Page<(typeof clients)[number]>; if (live) { setClients(page.items); setCursor(page.nextCursor); } })
        .catch(() => { if (live) setFailed(true); }).finally(() => { if (live) setLoading(false); });
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [open, programId, q, attempt]);
  async function more() {
    if (!cursor) return; setLoading(true);
    try { const page = await getJson(assignmentClientsPath(programId, { q, cursor })) as Page<(typeof clients)[number]>; setClients(old => [...old, ...page.items.filter(item => !old.some(row => row.id === item.id))]); setCursor(page.nextCursor); }
    catch { setFailed(true); } finally { setLoading(false); }
  }
  if (!(grants.edit || grants.publish)) return null;
  return <VStack gap={2} className="min-w-0 max-w-full">
    <Button variant="secondary" className="min-h-11 min-w-11" aria-expanded={open} onClick={() => { if (!open) { setLoading(true); setFailed(false); } setOpen(!open); }} label={t('assign.manyClients')} />
    {open ? <Card padding={3} className="min-w-0"><VStack gap={3} className="min-w-0">
      <TextInput label={t('assign.searchClients')} controlClassName="min-h-11" value={q} onChange={value => { setQ(value); setLoading(true); setFailed(false); }} />
      {loading ? <Text role="status" as="p">{t('assign.loading')}</Text> : null}
      {failed ? <VStack gap={2}><Text role="alert" as="p">{t('errors.failed')}</Text><HStack><Button variant="secondary" className="min-h-11 min-w-11" onClick={() => { setLoading(true); setFailed(false); setAttempt(value => value + 1); }} label={t('assign.retryLoad')} /></HStack></VStack> : null}
      {!loading && !failed && clients.length === 0 ? <Text as="p">{t('assign.noClients')}</Text> : null}
      {clients.map(client => <CheckboxInput key={client.id} className="min-h-11" label={`${name(client)} · ${client.code}`} value={picked.has(client.id)}
        onChange={checked => setPicked(old => { const next = new Map(old); if (checked) next.set(client.id, { id: client.id, name: name(client) }); else next.delete(client.id); return next; })} />)}
      {cursor ? <HStack><Button variant="secondary" className="min-h-11 min-w-11" isDisabled={loading} onClick={() => void more()} label={t('assign.loadMore')} /></HStack> : null}
      <AssignRunner key={programId} programId={programId} clients={[...picked.values()]} grants={grants} />
    </VStack></Card> : null}
  </VStack>;
}
