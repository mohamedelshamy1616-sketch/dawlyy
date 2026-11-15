'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { numberLocale } from '@/src/lib/numbers';
import { ACTIVITY_ENTITY_NAMES, type ActivityPage } from '@/src/server/activity/types';
import { actionKey, actorLabel, activityTimestamp, activityUrl, beginActivity, failActivity, settleActivity, versionNumber, type ActivityError, type ActivityState } from '@/src/server/activity/presentation';

export type ActivityEnvironment = { timezone: string; preferences: unknown; role?: 'owner' | 'staff' };
const frame = 'min-w-0 max-w-full';

export function ActivityLoading() {
  const t = useTranslations('activity');
  return <Text as="p" role="status" aria-live="polite">{t('loading')}</Text>;
}

export function ActivityForbidden() {
  const t = useTranslations('activity');
  return <VStack gap={3} className={frame}><Heading level={1}>{t('title')}</Heading><Text as="p" role="alert">{t('forbidden')}</Text></VStack>;
}

/** Presentational row list also supports Node rendering without mounting effects. */
export function ActivityLogView({ state, environment, entity = '', onMore, onRetry }: {
  state: ActivityState; environment: ActivityEnvironment; entity?: string; onMore?: () => void; onRetry?: () => void;
}) {
  const t = useTranslations('activity');
  const locale = numberLocale(useLocale());
  const format = { locale, timezone: environment.timezone, preferences: environment.preferences };
  return <VStack gap={3} width="100%" className={frame} aria-busy={state.loading || undefined}>
    {state.items.length ? <>
      <Text as="p" type="supporting" aria-live="polite">{t('count', { count: versionNumber(state.items.length, format) })}</Text>
      <List density="compact" edge="flush" hasDividers className={frame}>
        {state.items.map(item => {
          const when = activityTimestamp(item.createdAt, format);
          return <ListItem key={item.id} data-activity-id={item.id} className={frame} align="first-line"
            label={<Text as="p" weight="semibold" wordBreak="break-word">{t(`actions.${actionKey(item.action)}`)}</Text>}
            description={<VStack gap={2} className={frame}>
              <Text as="p" wordBreak="break-word">{actorLabel(item.actor, key => t(key))}</Text>
              <Text as="p" type="supporting">{when ? <time dateTime={item.createdAt}>{when}</time> : t('timeUnavailable')}</Text>
              <HStack gap={2} wrap="wrap" className={frame}>
                {item.href ? <Button href={item.href} label={t('itemLink')} variant="ghost" className="min-h-11 min-w-11 max-w-full" /> : <Text as="p" type="supporting">{t('itemUnavailable')}</Text>}
                {item.version ? <Button href={item.version.href} variant="secondary" className="min-h-11 min-w-11 max-w-full" label={t(item.version.canRevert ? 'revertLink' : 'viewVersion')} /> : null}
              </HStack>
            </VStack>}
          />;
        })}
      </List>
    </> : !state.loading && !state.error ? <Text as="p" role="status">{t(entity ? 'filteredEmpty' : 'empty')}</Text> : null}
    {state.loading ? <ActivityLoading /> : null}
    {state.error ? <VStack gap={2} className={frame}>
      <Text as="p" role="alert">{t(state.error)}</Text>
      {state.error !== 'forbidden' ? <Button label={t('retry')} variant="secondary" className="min-h-11 min-w-11 self-start" onClick={onRetry} /> : null}
    </VStack> : null}
    {state.nextCursor && !state.error ? <Button label={t('loadMore')} variant="secondary" className="min-h-11 min-w-11 self-start" isDisabled={state.loading} onClick={onMore} /> : null}
  </VStack>;
}

function requestError(status: number): ActivityError { return status === 401 || status === 403 ? 'forbidden' : status === 404 ? 'notFound' : 'requestFailed'; }
async function readJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { method: 'GET', cache: 'no-store', signal });
  if (!response.ok) throw Object.assign(new Error('Activity request failed'), { status: response.status });
  return response.json();
}
const statusOf = (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 0;

function ActivityController({ clientId, initial, environment: supplied }: { clientId?: string; initial?: ActivityPage; environment?: ActivityEnvironment }) {
  const t = useTranslations('activity');
  const [entity, setEntity] = useState('');
  const scope = `${clientId ?? ''}|${entity}`;
  const [state, setState] = useState<ActivityState>(() => initial ? { ...initial, scope, loading: false, append: false, error: null } : beginActivity(undefined, scope, false));
  const [environment, setEnvironment] = useState(supplied);
  const [environmentError, setEnvironmentError] = useState<ActivityError | null>(null);
  const [metadataAttempt, setMetadataAttempt] = useState(0);
  const activeRequest = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const initialScope = useRef(scope);
  const initialUsed = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (supplied) { setEnvironment(supplied); return; }
    const metadata = new AbortController();
    setEnvironmentError(null);
    void Promise.all([readJson('/api/v1/me/app', metadata.signal), readJson('/api/v1/settings/business', metadata.signal)]).then(([app, business]) => {
      if (metadata.signal.aborted) return;
      if (typeof business !== 'object' || business === null || !('timezone' in business) || typeof business.timezone !== 'string') throw new Error('Missing tenant timezone');
      new Intl.DateTimeFormat('en', { timeZone: business.timezone }).format(new Date(0));
      setEnvironment({ timezone: business.timezone, preferences: typeof app === 'object' && app !== null && 'preferences' in app ? app.preferences : undefined });
    }).catch((error: unknown) => { if (!metadata.signal.aborted) setEnvironmentError(requestError(statusOf(error))); });
    return () => metadata.abort();
  }, [supplied, metadataAttempt]);

  const load = useCallback(async (append: boolean) => {
    const current = stateRef.current;
    if (append && (current.scope !== scope || !current.nextCursor)) return;
    const cursor = append ? current.nextCursor : null;
    const sequence = ++activeRequest.current;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setState(old => beginActivity(old, scope, append));
    try {
      const page = await readJson(activityUrl({ clientId, entity: entity || undefined, cursor: cursor ?? undefined }), request.signal) as ActivityPage;
      if (request.signal.aborted || sequence !== activeRequest.current) return;
      if (!Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== 'string')) throw new Error('Invalid activity page');
      setState(old => settleActivity(old, scope, page));
    } catch (error) {
      if (!request.signal.aborted && sequence === activeRequest.current) setState(old => failActivity(old, scope, requestError(statusOf(error))));
    }
  }, [clientId, entity, scope]);

  useEffect(() => {
    if (initial && !initialUsed.current && initialScope.current === scope && !entity) {
      initialUsed.current = true;
      setState({ ...initial, scope, loading: false, append: false, error: null });
    }
    else void load(false);
    return () => { activeRequest.current++; controller.current?.abort(); };
  }, [initial, scope, entity, load]);

  const current = state.scope === scope ? state : beginActivity(undefined, scope, false);
  function retry() {
    if (environmentError) setMetadataAttempt(value => value + 1);
    if (current.error) void load(current.append);
  }
  return <VStack gap={4} width="100%" className={frame}>
    <Text as="p" type="supporting">{t(clientId ? 'clientScope' : supplied?.role === 'owner' ? 'ownerScope' : 'staffScope')}</Text>
    {!clientId ? <Selector label={t('filterLabel')} size="lg" value={entity} onChange={setEntity} controlClassName="min-h-11" options={[{ value: '', label: t('allEntities') }, ...ACTIVITY_ENTITY_NAMES.map(value => ({ value, label: t(`entities.${value}`) }))]} /> : null}
    {environment ? <ActivityLogView state={current} environment={environment} entity={entity} onMore={() => { if (!current.loading) void load(true); }} onRetry={retry} /> : environmentError ? <VStack gap={2}>
      <Text as="p" role="alert">{t(environmentError)}</Text>
      {environmentError !== 'forbidden' ? <Button label={t('retry')} variant="secondary" className="min-h-11 min-w-11 self-start" onClick={retry} /> : null}
    </VStack> : <ActivityLoading />}
  </VStack>;
}

/** Client hub slot: activity, app preferences and tenant timezone use authenticated GETs only. */
export function ActivityLog(props: { clientId?: string; initial?: ActivityPage }): React.JSX.Element {
  return <ActivityController {...props} />;
}

export function ActivityScreen({ initial, ...environment }: { initial: ActivityPage } & ActivityEnvironment) {
  const t = useTranslations('activity');
  return <VStack gap={5} width="100%" className={frame}>
    <Heading level={1}>{t('title')}</Heading><Text as="p" color="secondary">{t('subtitle')}</Text>
    <ActivityController initial={initial} environment={environment} />
  </VStack>;
}
