import { z } from 'zod';
import { notFound } from 'next/navigation';
import { requirePage } from '@/src/server/auth';
import { forbidden } from '@/src/api/errors';
import { loadTrackingPage } from '@/src/server/tracking/page-data';
import { TrackingScreen } from '@/components/tracking/tracking-screen';

/** Task 8: coach client tracking, cadence, measurements and photo comparison. */
export default async function CoachTrackingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requirePage(); if (auth.role === 'client') throw forbidden();
  const { clientId } = await params; if (!z.uuid().safeParse(clientId).success) notFound();
  return <TrackingScreen mode="coach" {...await loadTrackingPage(auth, clientId)} />;
}
