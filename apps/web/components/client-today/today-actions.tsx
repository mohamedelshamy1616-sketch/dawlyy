'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { VStack } from '@astryxdesign/core/VStack';
import { NutritionRequestError, nutritionRequest } from '@/components/nutrition/transport';
import type { ClientNutrition } from '@/components/nutrition/types';
import type { PortalToday } from '@/src/server/workout/contracts';
import { useClientModules, useResolvedModules } from './client-module-provider';
import type { ClientBootstrap, TodayLog } from './types';
import { ClientTodayView } from './today-view';
import { buildClientTodayModel, toTodayLog } from './view-model';

export type MealLogResult = { ok: true; log: TodayLog } | { ok: false; reason: 'module_disabled' | 'failed' };

type MealLogBody = {
  clientUuid: string; localDate: string; mealId: string; optionId: string; status: 'eaten'; clientUpdatedAt: string;
};
type LoggerDeps = {
  localDate: string;
  request?: typeof nutritionRequest;
  uuid?: () => string;
  now?: () => Date;
};

/**
 * R2a: one-tap "ate it". The write body, and with it the UUID and Idempotency-Key, is kept until the write
 * succeeds, so a double tap shares one request and a retry after a failure repeats the same write instead of
 * creating a second log. A refused or failed write changes nothing.
 */
export function createMealLogger(deps: LoggerDeps) {
  const request = deps.request ?? nutritionRequest;
  const uuid = deps.uuid ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date());
  const bodies = new Map<string, MealLogBody>();
  const inflight = new Map<string, Promise<MealLogResult>>();

  async function send(mealId: string, optionId: string): Promise<MealLogResult> {
    let body = bodies.get(mealId);
    if (!body || body.optionId !== optionId) {
      body = { clientUuid: uuid(), localDate: deps.localDate, mealId, optionId, status: 'eaten', clientUpdatedAt: now().toISOString() };
      bodies.set(mealId, body);
    }
    try {
      const row = await request<unknown>('/api/v1/meal-logs', { method: 'POST', body, key: body.clientUuid });
      bodies.delete(mealId);
      return { ok: true, log: toTodayLog(row) ?? { mealId, optionId, status: 'eaten', voidedAt: null } };
    } catch (error) {
      // The rejected write is not replayed: the module is off, so the caller refreshes the settings instead.
      if (error instanceof NutritionRequestError && error.status === 403 && error.code === 'module_disabled') {
        bodies.delete(mealId);
        return { ok: false, reason: 'module_disabled' };
      }
      return { ok: false, reason: 'failed' };
    }
  }

  return {
    log(mealId: string, optionId: string): Promise<MealLogResult> {
      const running = inflight.get(mealId);
      if (running) return running;
      const work = send(mealId, optionId).finally(() => { inflight.delete(mealId); });
      inflight.set(mealId, work);
      return work;
    },
  };
}

/** What the screen does with a finished write. A module refusal refreshes the settings and never retries the write. */
export function applyMealResult(result: MealLogResult, handlers: { onLogged: (log: TodayLog) => void; onModuleDisabled: () => void; onFailed: () => void }) {
  if (result.ok) handlers.onLogged(result.log);
  else if (result.reason === 'module_disabled') handlers.onModuleDisabled();
  else handlers.onFailed();
}

type Props = {
  today: PortalToday;
  nutrition: ClientNutrition | null;
  logs: TodayLog[];
  locale: 'ar' | 'en';
  bootstrap: ClientBootstrap;
};

/** R2a: Today with the live module switches and the ate-it write. The view itself never fetches. */
export function TodayActions({ today, nutrition, logs: initialLogs, locale, bootstrap }: Props) {
  const t = useTranslations('clientToday');
  const { modules, numerals } = useResolvedModules(bootstrap);
  const { refresh } = useClientModules();
  const [logs, setLogs] = useState<TodayLog[]>(initialLogs);
  const [busyMealId, setBusyMealId] = useState<string | null>(null);
  const [errorMealId, setErrorMealId] = useState<string | null>(null);
  const [disabledNotice, setDisabledNotice] = useState(false);
  const [logger] = useState(() => createMealLogger({ localDate: today.date }));
  const model = useMemo(() => buildClientTodayModel({ today, nutrition, logs, modules, locale, numerals }), [today, nutrition, logs, modules, locale, numerals]);

  async function onLogMeal(mealId: string, optionId: string) {
    if (busyMealId) return;
    setBusyMealId(mealId);
    setErrorMealId(null);
    const result = await logger.log(mealId, optionId);
    setBusyMealId(null);
    applyMealResult(result, {
      onLogged: log => setLogs(prev => [...prev, log]),
      onModuleDisabled: () => { setDisabledNotice(true); void refresh(); },
      onFailed: () => setErrorMealId(mealId),
    });
  }

  return (
    <VStack gap={4} className="min-w-0">
      {disabledNotice ? (
        <Banner status="warning" title={t('actions.moduleDisabled')} isDismissable dismissLabel={t('actions.dismiss')} onDismiss={() => setDisabledNotice(false)} />
      ) : null}
      <ClientTodayView model={model} onLogMeal={(mealId, optionId) => { void onLogMeal(mealId, optionId); }} busyMealId={busyMealId} errorMealId={errorMealId} />
    </VStack>
  );
}