import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { ActivityForbidden, ActivityScreen } from '@/components/activity/activity-log';
import { ApiError, forbidden } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requirePermission } from '@/src/server/require-permission';
import { listActivity } from '@/src/server/activity/read';
import { getBusiness, getPreferences } from '@/src/server/settings/client-read';

/** R3b: the initial page uses the same authenticated, RLS-scoped reader as GET /activity. */
export default async function ActivityPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  // Load inside try/catch, render outside it (react-hooks/error-boundaries).
  let loaded: Awaited<ReturnType<typeof loadActivityPage>> | null = null;
  try {
    loaded = await loadActivityPage(auth);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 403)) throw error;
  }
  if (!loaded) return <ActivityForbidden />;
  return <ActivityScreen {...loaded} role={auth.role === 'owner' ? 'owner' : 'staff'} />;
}

async function loadActivityPage(auth: Awaited<ReturnType<typeof requirePage>>) {
  if (auth.role !== 'owner' && auth.role !== 'staff') throw forbidden();
  requirePermission(auth, 'clients', 'view');
  return withAuthTx(auth, async tx => {
    const initial = await listActivity(tx, auth, {});
    const business = await getBusiness(tx, auth);
    const preferences = await getPreferences(tx, auth);
    return { initial, timezone: business.timezone, preferences };
  });
}
