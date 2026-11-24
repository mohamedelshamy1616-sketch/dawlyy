'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Utensils } from 'lucide-react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { SUPPLEMENT_TIMINGS, type Macros, type NutritionDocument } from '@dawlyy/core/types';
import { addMacros } from '@dawlyy/core/nutrition';
import { documentTotals } from '@/src/server/nutrition/helpers';
import { ClientMealCard, type MealStatus } from './client-meal-card';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { useRouter } from '@/i18n/navigation';
import { useClientModules } from '@/components/client-today/client-module-provider';
import { EntryActions } from '@/components/client-corrections/entry-actions';
import { MealEditor } from '@/components/client-corrections/meal-editor';
import { useUndoableAction } from '@/src/hooks/use-undoable-action';
import { runCorrection } from '@/src/lib/client-corrections/correction-actions';
import { correctionEligibility } from '@/src/lib/client-corrections/eligibility';
import { mealCorrection, sendMutation, correctionErrorKey, CorrectionError } from '@/src/lib/client-corrections/transport';
import type { MealHistoryRow } from '@/src/lib/client-corrections/types';
import { nutritionRequest } from './transport';
import { useWriteQueue } from './retry-queue';
import { foodText } from './shared';
import { mealHistoryRow, type ClientNutrition, type DailyLogs } from './types';
import { WaterCounter } from './water-counter';
import { formatKcal, formatMacro, formatNumber, formatNutrient, numberLocale } from '@/src/lib/numbers';

type Notice = 'sent' | 'queued' | 'error' | null;
type MealEntry = { clientUuid: string; status: MealStatus; row?: MealHistoryRow; pending?: boolean };
const activeRows = (logs: DailyLogs) => { const replaced = new Set(logs.items.flatMap(row => row.replacesId ? [row.replacesId] : [])); return logs.items.filter(row => !row.voidedAt && !replaced.has(row.id)); };
function entryMap(logs: DailyLogs): Record<string, MealEntry> {
  const result: Record<string, MealEntry> = {};
  for (const log of activeRows(logs)) if (log.mealId && !result[log.mealId] && (log.status === 'eaten' || log.status === 'partial' || log.status === 'skipped')) result[log.mealId] = { clientUuid: log.clientUuid, status: log.status, row: mealHistoryRow(log, logs.localDate) };
  return result;
}

/** Task 6: the client's meal screen for today; empty when no plan is published yet. */
export function ClientNutritionScreen({ plan, logs }: { plan: ClientNutrition; logs: DailyLogs }) {
  const t = useTranslations('nutrition'); const modules = useClientModules();
  if (modules.status !== 'ready' || !modules.modules?.nutrition) return null;
  if (!plan.head || !plan.version) return <EmptyState icon={<Utensils aria-hidden />} title={t('client.emptyTitle')} description={t('client.emptyBody')} />;
  return <TodayMeals plan={plan} document={plan.version.document} logs={logs} />;
}

function TodayMeals({ plan, document, logs }: { plan: ClientNutrition; document: NutritionDocument; logs: DailyLogs }) {
  const t = useTranslations('nutrition'); const c = useTranslations('clientCorrections'); const locale = useLocale();
  const modules = useClientModules(); const router = useRouter(); const { run } = useUndoableAction();
  const o = { locale: numberLocale(locale), numerals: modules.numerals }; const n = { format: (value: number) => formatNumber(value, o) };
  const queue = useWriteQueue(); const targets = plan.targets ?? document.targets;
  const [entries, setEntries] = useState<Record<string, MealEntry>>(() => entryMap(logs));
  const [history, setHistory] = useState(logs);
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(activeRows(logs).filter(row => row.mealId && row.optionId).map(row => [row.mealId!, row.optionId!])));
  const [editing, setEditing] = useState<MealHistoryRow | null>(null); const [changeError, setChangeError] = useState<string | null>(null);
  const [changing, setChanging] = useState<Record<string, boolean>>({}); const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(false); const locked = useRef(new Set<string>());
  const operations = useRef(new Map<string, ReturnType<typeof mealCorrection>>());
  const refresh = useCallback(async () => {
    try {
      const next = await nutritionRequest<DailyLogs>(`/api/v1/meal-logs?date=${encodeURIComponent(plan.localDate)}&limit=50`);
      if (!mounted.current) return;
      setNow(Date.now()); setHistory(next); setEntries(previous => {
        const authoritative = entryMap(next);
        for (const [id, entry] of Object.entries(previous)) if (entry.pending || !entry.row && !authoritative[id]) authoritative[id] = entry;
        return authoritative;
      });
    } catch { if (mounted.current) setChangeError('failed'); }
  }, [plan.localDate]);
  useEffect(() => {
    mounted.current = true;
    const foreground = () => { if (globalThis.document.visibilityState === 'visible') void refresh(); };
    globalThis.document.addEventListener('visibilitychange', foreground); window.addEventListener('online', foreground);
    queueMicrotask(() => { void refresh(); });
    return () => { mounted.current = false; globalThis.document.removeEventListener('visibilitychange', foreground); window.removeEventListener('online', foreground); };
  }, [refresh]);
  const [supplements, setSupplements] = useState<Record<string, { clientUuid: string; taken: boolean }>>(() => Object.fromEntries([...logs.supplements].reverse().map(s => [s.supplementId, { clientUuid: s.clientUuid, taken: s.taken }])));
  const [waterMl, setWaterMl] = useState(logs.waterMl); const [notice, setNotice] = useState<Notice>(null);
  const chosen = (mealId: string, first: string) => choice[mealId] ?? first;
  const planned = useMemo(() => { try { return documentTotals({ ...document, targets }, plan.foods, choice); } catch { return null; } }, [document, targets, plan.foods, choice]);
  const eaten: Macros = useMemo(() => {
    const meals = document.meals.filter(m => entries[m.id]?.status === 'eaten' && !entries[m.id]?.pending);
    const freeMacros = activeRows(history).filter(row => !row.mealId && row.status === 'eaten' && row.freeEntry?.macros).map(row => row.freeEntry!.macros!);
    if (!meals.length) return addMacros(...freeMacros);
    try { return addMacros(documentTotals({ ...document, targets, meals }, plan.foods, choice).total, ...freeMacros); } catch { return addMacros(); }
  }, [document, targets, plan.foods, choice, entries, history]);
  const free = activeRows(history).filter(l => !l.mealId && l.freeEntry?.text);

  async function write(path: string, body: { clientUuid: string; [field: string]: unknown }): Promise<boolean> {
    try { const result = await queue.send(path, body); if (mounted.current) setNotice(result); return true; } catch { if (mounted.current) setNotice('error'); return false; }
  }
  async function logMeal(mealId: string, status: MealStatus, optionId: string) {
    if (locked.current.has(mealId) || !modules.modules?.nutrition) return;
    const previous = entries[mealId];
    if (previous && !previous.row?.id) { setChangeError('syncFirst'); void refresh(); return; }
    if (previous?.row && !correctionEligibility(previous.row.createdAt, now, previous.row.voidedAt).eligible) { setChangeError('unavailable'); return; }
    if (!previous && queue.pending) { setChangeError('syncFirst'); return; }
    locked.current.add(mealId);
    if (previous?.row) {
      if (!navigator.onLine) { setChangeError('offline'); locked.current.delete(mealId); return; }
      let operation = operations.current.get(mealId);
      if (!operation) {
        operation = mealCorrection(previous.row.id, { clientUuid: crypto.randomUUID(), localDate: previous.row.localDate, mealId, optionId, status, ...(previous.row.freeEntry?.text ? { freeEntry: { text: previous.row.freeEntry.text, ...(previous.row.freeEntry.macros ? { macros: previous.row.freeEntry.macros } : {}) } } : {}), ...(previous.row.note ? { note: previous.row.note } : {}), clientUpdatedAt: new Date().toISOString() }, crypto.randomUUID());
        operations.current.set(mealId, operation);
      }
      const intended = operation.body; const previousChoice = previous.row.optionId;
      setChanging(rows => ({ ...rows, [mealId]: true })); setChangeError(null);
      const result = await runCorrection<MealHistoryRow>({ run, label: c('editedToast'), isMounted: () => mounted.current,
        optimistic: () => { setEntries(rows => ({ ...rows, [mealId]: { ...previous, status: intended.status, pending: true } })); setChoice(rows => ({ ...rows, [mealId]: intended.optionId ?? optionId })); },
        restore: () => { setEntries(rows => ({ ...rows, [mealId]: previous })); if (previousChoice) setChoice(rows => ({ ...rows, [mealId]: previousChoice })); },
        commit: () => sendMutation<MealHistoryRow>(operation!, { onModuleDisabled: async () => { await modules.refresh(); }, onRefresh: () => { router.refresh(); } }),
        onCommitted: row => { operations.current.delete(mealId); setChangeError(null); setFailed(rows => ({ ...rows, [mealId]: false })); setEntries(rows => ({ ...rows, [mealId]: { clientUuid: row.clientUuid, status: row.status as MealStatus, row } })); },
        onError: error => { setChangeError(correctionErrorKey(error)); setFailed(rows => ({ ...rows, [mealId]: !(error instanceof CorrectionError) || error.retryable })); if (error instanceof CorrectionError && !error.retryable) operations.current.delete(mealId); },
        onChanged: () => { router.refresh(); if (mounted.current) void refresh(); },
      });
      if (result.status === 'undone') operations.current.delete(mealId);
      if (mounted.current) setChanging(rows => ({ ...rows, [mealId]: false }));
      locked.current.delete(mealId); return;
    }
    const clientUuid = crypto.randomUUID();
    setEntries(old => ({ ...old, [mealId]: { clientUuid, status } }));
    const ok = await write('/api/v1/meal-logs', { clientUuid, localDate: plan.localDate, mealId, optionId, status, clientUpdatedAt: new Date().toISOString() });
    if (mounted.current && !ok) setEntries(old => { const copy = { ...old }; delete copy[mealId]; return copy; });
    if (ok) void refresh(); locked.current.delete(mealId);
  }
  async function logSupplement(supplementId: string, taken: boolean) {
    const previous = supplements[supplementId]; const clientUuid = crypto.randomUUID();
    setSupplements(old => ({ ...old, [supplementId]: { clientUuid, taken } }));
    const ok = await write('/api/v1/meal-logs/supplements', { clientUuid, supplementId, localDate: plan.localDate, taken, clientUpdatedAt: new Date().toISOString() });
    if (mounted.current && !ok) setSupplements(old => { const copy = { ...old }; if (previous) copy[supplementId] = previous; else delete copy[supplementId]; return copy; });
  }
  async function addWater(ml: number) {
    setWaterMl(v => v + ml);
    const ok = await write('/api/v1/meal-logs/water', { clientUuid: crypto.randomUUID(), amountMl: ml, localDate: plan.localDate });
    if (mounted.current && !ok) setWaterMl(v => v - ml);
  }

  return <VStack gap={4} width="100%" className="min-w-0 max-w-full break-words">
    {queue.pending > 0 || queue.offline ? <Banner status="info" title={queue.pending > 0 ? t('client.queued', { count: queue.pending }) : t('client.offline')} description={queue.pending > 0 ? t('client.queuedHint') : undefined} /> : null}
    {changeError ? <Banner status="error" title={c(changeError)} /> : null}
    {notice === 'error' ? <Banner status="error" title={t('errors.request')} isDismissable onDismiss={() => setNotice(null)} dismissLabel={t('common.close')} /> : null}
    <HStack gap={2} wrap="wrap" vAlign="center">
      <Heading level={2} type="display-3" wordBreak="break-word">{foodText(plan.head?.name, locale)}</Heading>
      <Text type="supporting">{t(`client.${plan.dayType}`)}</Text>
    </HStack>
    <Card padding={4}><VStack gap={3} width="100%">
      <Heading level={3} type="display-3">{t('client.totals')}</Heading>
      <VStack gap={2} width="100%">{(['kcal', 'proteinG', 'carbsG', 'fatG'] as const).map(key => <ProgressBar key={key} label={t(`macros.${key}`)} value={Math.min(eaten[key], Math.max(targets[key], 1))} max={Math.max(targets[key], 1)} hasValueLabel formatValueLabel={() => t('macros.progress', { value: formatNutrient(key, eaten[key], o), target: formatNutrient(key, targets[key], o) })} />)}</VStack>
      {planned ? <Text type="supporting" color="secondary">{t('client.plannedTotal', { kcal: formatKcal(planned.total.kcal, o), protein: formatMacro(planned.total.proteinG, o), carbs: formatMacro(planned.total.carbsG, o), fat: formatMacro(planned.total.fatG, o) })}</Text> : null}
    </VStack></Card>
    <VStack gap={3} width="100%">{document.meals.map(meal => {
      const first = meal.options[0]?.id ?? ''; const optionId = chosen(meal.id, first); const entry = entries[meal.id];
      return <VStack key={meal.id} gap={2} width="100%"><ClientMealCard meal={meal} foods={plan.foods} chosenOptionId={optionId} status={entry?.pending ? undefined : entry?.status} disabled={changing[meal.id] || !!entry && !entry.row?.id || !!entry?.row && !correctionEligibility(entry.row.createdAt, now, entry.row.voidedAt).eligible}
        optionMacros={planned?.perMeal.find(m => m.mealId === meal.id)?.options.find(o => o.optionId === optionId)?.macros}
        onChoose={id => { if (entry) void logMeal(meal.id, entry.status, id); else setChoice(old => ({ ...old, [meal.id]: id })); }}
        onStatus={status => void logMeal(meal.id, status, optionId)} />
        {entry && !entry.row?.id ? <Text role="status">{c('syncFirst')}</Text> : null}
        {entry?.row ? <EntryActions kind="meal" id={entry.row.id} createdAt={entry.row.createdAt} voidedAt={entry.row.voidedAt} onEdit={() => setEditing(entry.row!)} onPendingChange={pending => setEntries(rows => ({ ...rows, [meal.id]: { ...rows[meal.id]!, pending } }))} onChanged={() => { void refresh(); router.refresh(); }} /> : null}
        {failed[meal.id] ? <Button size="lg" label={c('retry')} onClick={() => void logMeal(meal.id, entry?.status ?? 'eaten', optionId)} /> : null}
      </VStack>;
    })}</VStack>
    {document.supplements.length ? <Card padding={4}><VStack gap={3} width="100%">
      <Heading level={3} type="display-3">{t('supplements.title')}</Heading>
      {SUPPLEMENT_TIMINGS.filter(timing => document.supplements.some(s => s.timing === timing)).map(timing => <VStack key={timing} gap={2} width="100%">
        <Text weight="semibold" color="secondary">{t(`timings.${timing}`)}</Text>
        {document.supplements.filter(s => s.timing === timing).map(s => {
          const taken = supplements[s.id]?.taken;
          return <VStack key={s.id} gap={1} width="100%">
            <Text weight="semibold" wordBreak="break-word">{foodText(s.name, locale)} · {n.format(s.dose)} {s.unit}</Text>
            {s.note ? <Text type="supporting" color="secondary">{foodText(s.note, locale)}</Text> : null}
            <HStack gap={2} wrap="wrap">
              <Button size="lg" variant={taken === true ? 'primary' : 'secondary'} label={t('supplements.taken')} onClick={() => void logSupplement(s.id, true)} />
              <Button size="lg" variant={taken === false ? 'primary' : 'secondary'} label={t('supplements.skipped')} onClick={() => void logSupplement(s.id, false)} />
            </HStack>
          </VStack>;
        })}
      </VStack>)}
    </VStack></Card> : null}
    <WaterCounter totalMl={waterMl} targetMl={targets.waterMl} onAdd={ml => void addWater(ml)} />
    {free.length ? <Card padding={4}><VStack gap={2} width="100%">
      <Heading level={3} type="display-3">{t('client.offPlan')}</Heading>
      {free.map(l => <Text key={l.id} wordBreak="break-word">{l.freeEntry?.text}</Text>)}
    </VStack></Card> : null}
    <HStack gap={2} wrap="wrap">
      <Button size="lg" variant="secondary" href="/app/nutrition/log" label={t('client.quickEntry')} />
      <Button size="lg" variant="ghost" href="/app/nutrition/history" label={t('client.history')} />
    </HStack>
    {editing ? <MealEditor row={editing} plan={plan} onClose={() => setEditing(null)} onChanged={() => { void refresh(); router.refresh(); }} onPendingChange={pending => { if (editing.mealId) setEntries(rows => ({ ...rows, [editing.mealId!]: { ...rows[editing.mealId!]!, pending } })); }} /> : null}
    {document.freeMealRule ? <Text type="supporting" color="secondary">{t('client.freeMealRule', { count: n.format(document.freeMealRule.perWeek) })}{document.freeMealRule.note ? ` ${foodText(document.freeMealRule.note, locale)}` : ''}</Text> : null}
  </VStack>;
}
