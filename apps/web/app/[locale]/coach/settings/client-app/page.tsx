import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { ClientAppComposer } from '@/components/client-app-composer/composer';
import { numberLocale, numeralPolicy } from '@/src/lib/numbers';
import { forbidden } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requirePermission } from '@/src/server/require-permission';
import { getTenantClientModules } from '@/src/server/client-modules';
import { getPreferences } from '@/src/server/settings/client-read';

/** R2c: tenant defaults for the client app. Staff with settings view read; only the owner saves. */
export default async function ClientAppSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  if (auth.role !== 'owner' && auth.role !== 'staff') throw forbidden();
  requirePermission(auth, 'settings', 'view');
  const data = await withAuthTx(auth, async tx => ({ modules: await getTenantClientModules(tx, auth), preferences: await getPreferences(tx, auth) }));
  return <ClientAppComposer seed={{
    mode: 'tenant', locale: numberLocale(locale), numerals: numeralPolicy(data.preferences),
    tenantModules: data.modules, effectiveModules: data.modules, canSave: auth.role === 'owner',
  }} />;
}
