'use client';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Utensils } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
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
import { MacroProgress } from './macro-progress';
import { useWriteQueue } from './retry-queue';
import { foodText } from './shared';
import type { ClientNutrition, DailyLogs } from './types';
import { WaterCounter } from './water-counter';

type Notice = 'sent' | 'queued' | 'error' | null;

/** Task 6: the client's meal screen for today; empty when no plan is published yet. */
export function ClientNutritionScreen({ plan, logs }: { plan: ClientNutrition; logs: DailyLogs }) {
  const t = useTranslations('nutrition');
  if (!plan.head || !plan.version) return <EmptyState icon={<Utensils aria-hidden />} title={t('client.emptyTitle')} description={t('client.emptyBody')} />;
  return <TodayMeals plan={plan} document={plan.version.document} logs={logs} />;
}

function TodayMeals({ plan, document, logs }: { plan: ClientNutrition; document: NutritionDocument; logs: DailyLogs }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const n = new Intl.NumberFormat(locale);
  const queue = useWriteQueue(); const targets = plan.targets ?? document.targets;
  const [entries, setEntries] = useState<Record<string, { clientUuid: string; status: MealStatus }>>(() => {
    const result: Record<string, { clientUuid: string; status: MealStatus }> = {};
    for (const log of logs.items) if (log.mealId && !result[log.mealId] && (log.status === 'eaten' || log.status === 'partial' || log.status === 'skipped')) result[log.mealId] = { clientUuid: log.clientUuid, status: log.status };
    return result;
  });
  const [choice, setChoice] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    for (const log of logs.items) if (log.mealId && log.optionId && !result[log.mealId]) result[log.mealId] = log.optionId;
    return result;
  });
  const [supplements, setSupplements] = useState<Record<string, { clientUuid: string; taken: boolean }>>(() => Object.fromEntries(logs.supplements.map(s => [s.supplementId, { clientUuid: s.clientUuid, taken: s.taken }])));
  const [waterMl, setWaterMl] = useState(logs.waterMl); const [notice, setNotice] = useState<Notice>(null);
  const chosen = (mealId: string, first: string) => choice[mealId] ?? first;
  const planned = useMemo(() => { try { return documentTotals({ ...document, targets }, plan.foods, choice); } catch { return null; } }, [document, targets, plan.foods, choice]);
  const eaten: Macros = useMemo(() => {
    const meals = document.meals.filter(m => entries[m.id]?.status === 'eaten'); if (!meals.length) return addMacros();
    try { return documentTotals({ ...document, targets, meals }, plan.foods, choice).total; } catch { return addMacros(); }
  }, [document, targets, plan.foods, choice, entries]);
  const free = logs.items.filter(l => !l.mealId && l.freeEntry?.text);

  async function write(path: string, body: { clientUuid: string; [field: string]: unknown }): Promise<boolean> {
    try { setNotice(await queue.send(path, body)); return true; } catch { setNotice('error'); return false; }
  }
  async function logMeal(mealId: string, status: MealStatus, optionId: string) {
    const previous = entries[mealId]; const clientUuid = previous?.clientUuid ?? crypto.randomUUID();
    setEntries(old => ({ ...old, [mealId]: { clientUuid, status } }));
    const ok = await write('/api/v1/meal-logs', { clientUuid, localDate: plan.localDate, mealId, optionId, status, clientUpdatedAt: new Date().toISOString() });
    if (!ok) setEntries(old => { const copy = { ...old }; if (previous) copy[mealId] = previous; else delete copy[mealId]; return copy; });
  }
  async function logSupplement(supplementId: string, taken: boolean) {
    const previous = supplements[supplementId]; const clientUuid = previous?.clientUuid ?? crypto.randomUUID();
    setSupplements(old => ({ ...old, [supplementId]: { clientUuid, taken } }));
    const ok = await write('/api/v1/meal-logs/supplements', { clientUuid, supplementId, localDate: plan.localDate, taken, clientUpdatedAt: new Date().toISOString() });
    if (!ok) setSupplements(old => { const copy = { ...old }; if (previous) copy[supplementId] = previous; else delete copy[supplementId]; return copy; });
  }
  async function addWater(ml: number) {
    setWaterMl(v => v + ml);
    const ok = await write('/api/v1/meal-logs/water', { clientUuid: crypto.randomUUID(), amountMl: ml, localDate: plan.localDate });
    if (!ok) setWaterMl(v => v - ml);
  }

  return <VStack gap={4} width="100%" className="min-w-0 max-w-full [overflow-wrap:anywhere]">
    {queue.pending > 0 || queue.offline ? <Banner status="info" title={queue.pending > 0 ? t('client.queued', { count: queue.pending }) : t('client.offline')} description={queue.pending > 0 ? t('client.queuedHint') : undefined} /> : null}
    {notice === 'error' ? <Banner status="error" title={t('errors.request')} isDismissable onDismiss={() => setNotice(null)} dismissLabel={t('common.close')} /> : null}
    <HStack gap={2} wrap="wrap" vAlign="center">
      <Heading level={2} type="display-3" wordBreak="break-word">{foodText(plan.head?.name, locale)}</Heading>
      <Badge variant="info" label={t(`client.${plan.dayType}`)} />
    </HStack>
    <Card padding={4}><VStack gap={3} width="100%">
      <Heading level={3} type="display-3">{t('client.totals')}</Heading>
      <MacroProgress macros={eaten} targets={targets} />
      {planned ? <Text type="supporting" color="secondary">{t('client.plannedTotal', { kcal: n.format(planned.total.kcal), protein: n.format(planned.total.proteinG), carbs: n.format(planned.total.carbsG), fat: n.format(planned.total.fatG) })}</Text> : null}
    </VStack></Card>
    <VStack gap={3} width="100%">{document.meals.map(meal => {
      const first = meal.options[0]?.id ?? ''; const optionId = chosen(meal.id, first); const entry = entries[meal.id];
      return <ClientMealCard key={meal.id} meal={meal} foods={plan.foods} chosenOptionId={optionId} status={entry?.status}
        optionMacros={planned?.perMeal.find(m => m.mealId === meal.id)?.options.find(o => o.optionId === optionId)?.macros}
        onChoose={id => { setChoice(old => ({ ...old, [meal.id]: id })); if (entry) void logMeal(meal.id, entry.status, id); }}
        onStatus={status => void logMeal(meal.id, status, optionId)} />;
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
    {document.freeMealRule ? <Text type="supporting" color="secondary">{t('client.freeMealRule', { count: n.format(document.freeMealRule.perWeek) })}{document.freeMealRule.note ? ` ${foodText(document.freeMealRule.note, locale)}` : ''}</Text> : null}
  </VStack>;
}
