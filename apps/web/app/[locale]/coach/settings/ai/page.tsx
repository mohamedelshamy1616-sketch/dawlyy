import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { ProviderStatus } from '@/components/ai-settings/provider-status';
import { numberLocale, numeralPolicy } from '@/src/lib/numbers';
import { forbidden } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requirePermission } from '@/src/server/require-permission';
import { getPreferences } from '@/src/server/settings/client-read';
import { getAiProviderStatus } from '@/src/server/ai/config';

/** R4d: staff-only read of redacted configuration. Never constructs or invokes an adapter. */
export default async function AiSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  if (auth.role !== 'owner' && auth.role !== 'staff') throw forbidden();
  requirePermission(auth, 'settings', 'view');
  const preferences = await withAuthTx(auth, tx => getPreferences(tx, auth));
  const status = getAiProviderStatus();
  return <ProviderStatus status={status} locale={numberLocale(locale)} numerals={numeralPolicy(preferences)} />;
}
