import { requirePage } from '@/src/server/auth';
import { forbidden } from '@/src/api/errors';
import { loadTrackingPage } from '@/src/server/tracking/page-data';
import { TrackingScreen } from '@/components/tracking/tracking-screen';

/** Task 8: own-client tracking follows coach-configured cadence and shows missing entries. */
export default async function TrackingPage() {
  const auth = await requirePage(); if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  return <TrackingScreen mode="tracking" {...await loadTrackingPage(auth, auth.clientId)} />;
}
