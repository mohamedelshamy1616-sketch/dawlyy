'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ClientModules } from '@dawlyy/core/types';
import type { ClientBootstrap } from './types';

export type ClientModuleStatus = 'loading' | 'ready' | 'error';
export type ClientModuleState = {
  status: ClientModuleStatus;
  modules: ClientModules | null;
  numerals: 'latn' | 'arab';
  userId: string | null;
  /** True while a refresh is running; the last validated modules stay in place meanwhile. */
  refreshing: boolean;
  refresh: () => Promise<void>;
  seed: (value: { userId: string } & ClientBootstrap) => void;
};

type UnreadSnapshot = { userId: string; count: number };
const UnreadContext = createContext<{
  snapshot: UnreadSnapshot | null;
  publish: (snapshot: UnreadSnapshot | null) => void;
}>({ snapshot: null, publish: () => {} });

export function ClientUnreadSeed({ userId, count }: UnreadSnapshot) {
  const { publish } = useContext(UnreadContext);
  useEffect(() => {
    publish({ userId, count });
    return () => publish(null);
  }, [publish, userId, count]);
  return null;
}

export function useClientUnread() {
  const { snapshot } = useContext(UnreadContext);
  const { userId, modules } = useContext(ModuleContext);
  return modules?.messages && snapshot?.userId === userId ? snapshot?.count : undefined;
}

const noop = async () => {};
const ModuleContext = createContext<ClientModuleState>({
  status: 'loading', modules: null, numerals: 'latn', userId: null, refreshing: false, refresh: noop, seed: () => {},
});

/** R2a: reads and validates GET /api/v1/me/app. Anything that does not parse is a failure, never "all on". */
export async function fetchClientBootstrap(fetcher: typeof fetch = fetch): Promise<ClientBootstrap | null> {
  try {
    const response = await fetcher('/api/v1/me/app', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    const parsed = ClientModules.safeParse((body as { clientModules?: unknown }).clientModules);
    if (!parsed.success) return null;
    return { modules: parsed.data, numerals: (body as { numerals?: unknown }).numerals === 'arab' ? 'arab' : 'latn' };
  } catch { return null; }
}

type Held = { userId: string | null; modules: ClientModules | null; numerals: 'latn' | 'arab' };

/**
 * R2a: validated client switches for navigation and hubs. State is held in memory only (never a shared storage
 * key) and is replaced whenever the signed-in user changes.
 */
export function ClientModuleProvider({ children, initial }: { children: React.ReactNode; initial?: ({ userId: string } & ClientBootstrap) | null }) {
  const [snapshot, publish] = useState<UnreadSnapshot | null>(null);
  const unread = useMemo(() => ({ snapshot, publish }), [snapshot]);
  const [held, setHeld] = useState<Held>(() => ({ userId: initial?.userId ?? null, modules: initial?.modules ?? null, numerals: initial?.numerals ?? 'latn' }));
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const owner = useRef<string | null>(held.userId);
  const inflight = useRef<Promise<void> | null>(null);

  const seed = useCallback((value: { userId: string } & ClientBootstrap) => {
    owner.current = value.userId;
    setFailed(false);
    setHeld(prev => (prev.userId === value.userId && prev.modules && JSON.stringify(prev.modules) === JSON.stringify(value.modules) && prev.numerals === value.numerals
      ? prev : { userId: value.userId, modules: value.modules, numerals: value.numerals }));
  }, []);

  const refresh = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const startedFor = owner.current;
    setRefreshing(true);
    const work = (async () => {
      const next = await fetchClientBootstrap();
      // A response for a previous account must not land on the current one.
      if (owner.current !== startedFor) return;
      if (next) { setFailed(false); setHeld(prev => ({ ...prev, modules: next.modules, numerals: next.numerals })); }
      else setFailed(true);
    })().finally(() => { inflight.current = null; setRefreshing(false); });
    inflight.current = work;
    return work;
  }, []);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && owner.current) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // If the server seed never arrives, ask for the bootstrap once instead of waiting forever.
  useEffect(() => {
    if (held.modules) return;
    const timer = window.setTimeout(() => { void refresh(); }, 4000);
    return () => window.clearTimeout(timer);
  }, [held.modules, refresh]);

  const value = useMemo<ClientModuleState>(() => ({
    status: held.modules ? 'ready' : failed ? 'error' : 'loading',
    modules: held.modules, numerals: held.numerals, userId: held.userId, refreshing, refresh, seed,
  }), [held, failed, refreshing, refresh, seed]);
  return <ModuleContext.Provider value={value}><UnreadContext.Provider value={unread}>{children}</UnreadContext.Provider></ModuleContext.Provider>;
}

/** R2a: server-rendered bootstrap handed to the provider by the authenticated layout and every client hub. */
export function ClientModuleSeed({ userId, modules, numerals }: { userId: string } & ClientBootstrap) {
  const { seed } = useContext(ModuleContext);
  const key = JSON.stringify(modules);
  useEffect(() => { seed({ userId, modules: JSON.parse(key) as ClientModules, numerals }); }, [seed, userId, key, numerals]);
  return null;
}

export function useClientModules(): ClientModuleState { return useContext(ModuleContext); }

/** Live modules once the provider has them, the server-rendered ones before that. */
export function useResolvedModules(initial: ClientBootstrap): ClientBootstrap {
  const live = useContext(ModuleContext);
  return live.modules ? { modules: live.modules, numerals: live.numerals } : initial;
}
