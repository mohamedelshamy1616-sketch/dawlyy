import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { isAllowed } from '@dawlyy/core/authz';
import { localDateOf } from '@dawlyy/core/schedule';
import { ClientAppComposer } from '@/components/client-app-composer/composer';
import { numberLocale, numeralPolicy } from '@/src/lib/numbers';
import { ApiError, forbidden } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requirePermission } from '@/src/server/require-permission';
import { getClientModules, getTenantClientModules } from '@/src/server/client-modules';
import { getClient, getClientOverrides } from '@/src/server/clients/service';
import { getPreferences } from '@/src/server/settings/client-read';

/** R2c: one client's module override. Needs settings view, clients view and edit; saving also needs billing edit. */
export default async function ClientAppPage({ params }: { params: Promise<{ locale: string; clientId: string }> }) {
  await connection();
  const { locale, clientId } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  if (auth.role !== 'owner' && auth.role !== 'staff') throw forbidden();
  if (!z.string().uuid().safeParse(clientId).success) notFound();
  requirePermission(auth, 'settings', 'view');
  requirePermission(auth, 'clients', 'view');
  requirePermission(auth, 'clients', 'edit');
  const data = await withAuthTx(auth, async tx => {
    const client = await getClient(tx, auth, clientId);
    const overrides = await getClientOverrides(tx, auth, clientId);
    return {
      client, preferences: await getPreferences(tx, auth),
      tenant: await getTenantClientModules(tx, auth), effective: await getClientModules(tx, auth, clientId),
      rows: overrides.overrides.map(row => ({ id: row.id, createdAt: row.createdAt.toISOString(), override: row.override })),
    };
  }).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const name = data.client.displayName || [data.client.firstName, data.client.lastName].filter(Boolean).join(' ');
  return <ClientAppComposer seed={{
    mode: 'client', clientId, clientName: name, locale: numberLocale(locale), numerals: numeralPolicy(data.preferences),
    tenantModules: data.tenant, effectiveModules: data.effective, canSave: isAllowed(auth, 'billing', 'edit'),
    today: localDateOf(new Date().toISOString(), data.client.timezone), rows: data.rows,
  }} />;
}
