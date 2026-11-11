import { requirePage } from '@/src/server/auth';
import { forbidden } from '@/src/api/errors';
import { loadTrackingPage } from '@/src/server/tracking/page-data';
import { TrackingScreen } from '@/components/tracking/tracking-screen';

/** Task 8: own-client progress history, measurement deltas and private photo comparison. */
export default async function ProgressPage() {
  const auth = await requirePage(); if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  return <TrackingScreen mode="progress" {...await loadTrackingPage(auth, auth.clientId)} />;
}
