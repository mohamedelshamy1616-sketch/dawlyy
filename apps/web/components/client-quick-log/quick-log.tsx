'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { addDays } from '@dawlyy/core/schedule';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from '@/i18n/navigation';
import { useClientModules } from '@/components/client-today/client-module-provider';
import type { ClientNutrition, DailyLogs } from '@/components/nutrition/types';
import { nutritionRequest } from '@/components/nutrition/transport';
import { buildQuickLogChoices, createQuickLogRunner, type QuickLogChoice } from '@/src/lib/client-corrections/quick-log';
import { mealCreate, sendMutation, CorrectionError } from '@/src/lib/client-corrections/transport';
import { formatNumber } from '@/src/lib/numbers';
import type { MealHistoryRow } from '@/src/lib/client-corrections/types';

export type RecentCursor = { date: string; cursor: string };
type RowStatus = 'saving' | 'saved' | 'error';
export type ClientQuickLogProps = {
  localDate: string; plan: ClientNutrition | null; recent: readonly MealHistoryRow[]; onLogged?: () => void;
  initialCursors?: RecentCursor[]; initialError?: boolean;
};
/** Bootstrap completes before the account-scoped row state mounts. Account/date changes discard that state. */
export function ClientQuickLog(props: ClientQuickLogProps) {
  const modules = useClientModules(); const t = useTranslations('quickLog');
  if (modules.status === 'loading') return <Text role="status">{t('moduleLoading')}</Text>;
  if (modules.status === 'error') return <VStack gap={2}><Banner status="error" title={t('moduleError')} /><Button size="lg" className="min-h-11" label={t('retry')} onClick={() => void modules.refresh()} /></VStack>;
  if (!modules.modules?.nutrition) return <Text>{t('disabled')}</Text>;
  return <ClientQuickLogRows key={`${modules.userId}:${props.localDate}`} {...props} />;
}
/** Each labelled row is the second tap after Today. Creates never enter the correction outbox. */
function ClientQuickLogRows({ localDate, plan, recent, onLogged, initialCursors = [], initialError = false }: ClientQuickLogProps) {
  const t = useTranslations('quickLog'); const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const modules = useClientModules(); const router = useRouter();
  const [loaded, setLoaded] = useState(recent); const [currentPlan, setCurrentPlan] = useState(plan);
  const [cursors, setCursors] = useState(initialCursors); const [loading, setLoading] = useState(false); const [loadError, setLoadError] = useState(initialError);
  const [states, setStates] = useState<Record<string, RowStatus>>({}); const [offline, setOffline] = useState(false);
  const mounted = useRef(false); const busy = useRef(false); const [ownerId] = useState(modules.userId); const owner = useRef(ownerId); const liveOwner = useRef(ownerId);
  useEffect(() => { liveOwner.current = modules.userId; }, [modules.userId]);
  const runner = useRef(createQuickLogRunner({ make: (choice: QuickLogChoice) => mealCreate(choice.create(crypto.randomUUID(), new Date().toISOString()), crypto.randomUUID()), send: (operation: ReturnType<typeof mealCreate>) => sendMutation(operation, { onModuleDisabled: async () => { await modules.refresh(); router.refresh(); } }) }));
  const choices = useMemo(() => buildQuickLogChoices({ localDate, plan: currentPlan, recent: loaded, locale, numerals: modules.numerals }), [localDate, currentPlan, loaded, locale, modules.numerals]);
  const refresh = useCallback(async () => {
    if (busy.current || owner.current !== liveOwner.current) return;
    setLoading(true); setLoadError(false);
    try {
      const dates = Array.from({ length: 7 }, (_, index) => addDays(localDate, -index - 1));
      const [nextPlan, pages] = await Promise.all([
        nutritionRequest<ClientNutrition>('/api/v1/nutrition/me').catch(() => null),
        Promise.all(dates.map(date => nutritionRequest<DailyLogs>(`/api/v1/meal-logs?date=${encodeURIComponent(date)}&limit=50`))),
      ]);
      if (!mounted.current || owner.current !== liveOwner.current) return;
      setCurrentPlan(nextPlan); setLoaded(pages.flatMap((page, index) => page.items.map(row => ({ ...row, localDate: row.localDate ?? dates[index]!, createdAt: row.createdAt ?? null, voidedAt: row.voidedAt ?? null, replacesId: row.replacesId ?? null }))));
      setCursors(pages.flatMap((page, index) => page.nextCursor ? [{ date: dates[index]!, cursor: page.nextCursor }] : []));
    } catch { if (mounted.current) setLoadError(true); }
    finally { if (mounted.current) setLoading(false); }
  }, [localDate]);
  useEffect(() => {
    mounted.current = true;
    const foreground = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', foreground);
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', foreground); };
  }, [refresh]);
  async function more(page: RecentCursor) {
    if (loading || owner.current !== liveOwner.current) return;
    setLoading(true); setLoadError(false);
    try {
      const next = await nutritionRequest<DailyLogs>(`/api/v1/meal-logs?date=${encodeURIComponent(page.date)}&limit=50&cursor=${encodeURIComponent(page.cursor)}`);
      if (!mounted.current || owner.current !== liveOwner.current) return;
      setLoaded(rows => [...rows, ...next.items.map(row => ({ ...row, localDate: row.localDate ?? page.date, createdAt: row.createdAt ?? null, voidedAt: row.voidedAt ?? null, replacesId: row.replacesId ?? null }))]);
      setCursors(rows => [...rows.filter(row => row.date !== page.date), ...(next.nextCursor ? [{ date: page.date, cursor: next.nextCursor }] : [])]);
    } catch { if (mounted.current) setLoadError(true); }
    finally { if (mounted.current) setLoading(false); }
  }
  async function save(choice: QuickLogChoice) {
    if (busy.current || states[choice.key] === 'saved' || !modules.modules?.nutrition || owner.current !== liveOwner.current) return;
    if (!navigator.onLine) { setOffline(true); return; }
    busy.current = true; setOffline(false); setStates(rows => ({ ...rows, [choice.key]: 'saving' }));
    try {
      const result = await runner.current.submit(choice); if (result.status === 'busy') return;
      if (!mounted.current || owner.current !== liveOwner.current) return;
      setStates(rows => ({ ...rows, [choice.key]: 'saved' })); runner.current.forget(choice.key); onLogged?.(); router.refresh();
    } catch (error) {
      if (!mounted.current || owner.current !== liveOwner.current) return;
      if (error instanceof CorrectionError && error.code === 'module_disabled') { runner.current.forget(choice.key); setStates({}); await modules.refresh(); router.refresh(); }
      else { if (error instanceof CorrectionError && !error.retryable) runner.current.forget(choice.key); setStates(rows => ({ ...rows, [choice.key]: 'error' })); }
    } finally { busy.current = false; }
  }
  if (ownerId !== modules.userId || modules.status === 'loading') return <Text role="status">{t('moduleLoading')}</Text>;
  if (modules.status === 'error') return <VStack gap={2}><Banner status="error" title={t('moduleError')} /><Button size="lg" className="min-h-11" label={t('retry')} onClick={() => void modules.refresh()} /></VStack>;
  if (!modules.modules?.nutrition) return <Text>{t('disabled')}</Text>;
  return <VStack gap={3} width="100%" className="min-w-0 max-w-full break-words" data-testid="quick-log">
    <Heading level={2} type="display-3">{t('title')}</Heading>
    <Text type="supporting" color="secondary">{t('loadedHint', { limit: formatNumber(50, { locale, numerals: modules.numerals }) })}</Text>
    {loading ? <Text role="status">{t('loading')}</Text> : null}
    {loadError ? <HStack gap={2} wrap="wrap"><Banner status="error" title={t('loadFailed')} /><Button size="lg" className="min-h-11" label={t('retry')} onClick={() => void refresh()} /></HStack> : null}
    {offline ? <Banner status="info" title={t('offline')} /> : null}
    {!loading && choices.length === 0 ? <VStack gap={1}><Heading level={3} type="display-3">{t('emptyTitle')}</Heading><Text>{t('emptyBody')}</Text></VStack> : null}
    {choices.map(choice => <HStack key={choice.key} gap={2} wrap="wrap" width="100%" className="min-w-0 max-w-full">
      <Button size="lg" width="100%" variant="secondary" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words" data-quick-log-key={choice.key}
        label={t(choice.labelKey, choice.labelParams)} isLoading={states[choice.key] === 'saving'} isDisabled={states[choice.key] === 'saved' || Object.values(states).includes('saving')} onClick={() => void save(choice)} />
      {states[choice.key] ? <Text role="status">{t(states[choice.key] === 'error' ? 'failed' : states[choice.key]!)}</Text> : null}
      {states[choice.key] === 'error' ? <Button size="lg" className="min-h-11" label={t('retry')} isDisabled={Object.values(states).includes('saving')} onClick={() => void save(choice)} /> : null}
    </HStack>)}
    {cursors.map(page => <Button key={page.date} size="lg" variant="ghost" className="min-h-11" isDisabled={loading} label={t('more', { date: new Intl.DateTimeFormat(locale, { numberingSystem: modules.numerals, year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${page.date}T12:00:00Z`)) })} onClick={() => void more(page)} />)}
  </VStack>;
}
