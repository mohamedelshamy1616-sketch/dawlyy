import { localDateOf } from '@dawlyy/core/schedule';
import { withAuthTx, type AuthContext } from '../db';
import { visibleClient } from './access';
import { getCadence } from './cadence';
import { listMeasurements, listMetrics } from './entries';
import { listPhotos } from './photos';

/** Task 8: Server Components use exactly the authenticated API services and safe projections. */
export async function loadTrackingPage(auth: AuthContext, clientId: string) {
  return withAuthTx(auth, async tx => {
    const cadence = await getCadence(tx, auth, clientId);
    const client = await visibleClient(tx, auth, clientId);
    const query = { clientId, limit: '100' };
    const metricPage = await listMetrics(tx, auth, query);
    const measurementPage = await listMeasurements(tx, auth, query);
    const photoPage = await listPhotos(tx, auth, { clientId, limit: '20' });
    return { clientId, cadence, timezone: client.timezone, today: localDateOf(new Date().toISOString(), client.timezone),
      metrics: { ...metricPage, items: metricPage.items.map(({ id, metric, metricKey, value, unit, localDate, correctionOf, createdAt, voidedAt }) => ({ id, metric, metricKey, value, unit, localDate, correctionOf, createdAt: createdAt.toISOString(), voidedAt: voidedAt?.toISOString() ?? null })) },
      measurements: { ...measurementPage, items: measurementPage.items.map(({ id, localDate, values, deltas, createdAt, voidedAt, replacesId }) => ({ id, localDate, values, deltas, createdAt: createdAt.toISOString(), voidedAt: voidedAt?.toISOString() ?? null, replacesId })) },
      photos: { ...photoPage, items: photoPage.items.map(({ id, localDate, poses }) => ({ id, localDate, poses })) } };
  });
}
