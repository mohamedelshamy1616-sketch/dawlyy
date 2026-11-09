import { entitlementId, resolveEntitlements } from '@dawlyy/core/entitlements';
import { searchKey } from '@dawlyy/core/text';
import type { Entitlement, EntitlementOverride, PackageEntitlements } from '@dawlyy/core/types';

/** Task 3: one folded search document for all client name and contact columns. */
export function buildClientSearchKey(client: { firstName: string; lastName?: string | null; displayName?: string | null; phone?: string | null; email?: string | null }): string {
  return searchKey([client.firstName, client.lastName, client.displayName, client.phone, client.email].filter(Boolean).join(' '));
}

const fields = ['enabled', 'frequency', 'limit', 'durationDays', 'turnaroundHours', 'mediaTypes', 'note'] as const;

/** Task 3: resolved entitlement values with per-field provenance and a meaningful difference badge. */
export function entitlementDisplay(base: PackageEntitlements, overrides: EntitlementOverride[]) {
  return resolveEntitlements(base, overrides).map(value => {
    const id = entitlementId(value);
    const original = base.find(item => entitlementId(item) === id);
    const changes = overrides.filter(item => entitlementId(item) === id);
    const sources = Object.fromEntries(fields.map(field => [field,
      changes.some(item => item[field] !== undefined) ? 'override' : 'package',
    ])) as Record<(typeof fields)[number], 'package' | 'override'>;
    return { ...value, sources, overridden: fields.some(field => !equalField(value[field], original?.[field])) };
  });
}

function equalField(a: Entitlement[(typeof fields)[number]], b: Entitlement[(typeof fields)[number]]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return [...a].sort().join('|') === [...b].sort().join('|');
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    return a.ar === b.ar && a.en === b.en;
  }
  return a === b;
}
