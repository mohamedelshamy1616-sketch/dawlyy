import 'server-only';
import type { AuthContext, Tx } from '../db';
import { getClientModules } from '../client-modules';
import type { metricKinds } from './contracts';

type MetricKind = (typeof metricKinds)[number];

/** Generic logging and form-derived metrics share the same client-module ownership. */
export function metricClientModule(metric: MetricKind): 'nutrition' | 'measurements' {
  return metric === 'water' || metric === 'calories_in' ? 'nutrition' : 'measurements';
}

/** Disabled derived metrics are skipped without invalidating their form submission. */
export async function enabledMetrics<T extends { metric: MetricKind }>(
  tx: Tx, auth: AuthContext, clientId: string, entries: readonly T[],
): Promise<readonly T[]> {
  if (auth.role !== 'client') return entries;
  const modules = await getClientModules(tx, auth, clientId);
  return entries.filter(entry => modules[metricClientModule(entry.metric)]);
}
