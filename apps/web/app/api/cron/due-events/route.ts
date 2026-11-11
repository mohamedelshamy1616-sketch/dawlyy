import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { processDueEvents } from '@/src/server/calendar/processor';
import { processDeliveries } from '@/src/server/notify';

/** Task 8: secret-authenticated, explicitly tenant-scoped cron; missing configuration always fails closed. */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? request.headers.get('x-cron-secret') ?? '';
  if (!secret || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) return Response.json({ error: { code: 'forbidden', message: 'Forbidden' } }, { status: 403 });
  // A caller supplies one tenant per invocation; there is no unscoped service discovery query.
  const tenant = z.uuid().safeParse(new URL(request.url).searchParams.get('tenantId'));
  if (!tenant.success) return Response.json({ error: { code: 'validation_error', message: 'tenantId is required' } }, { status: 400 });
  try {
    const due = await processDueEvents(tenant.data);
    // Task 9: the same pass sends the reminders it just queued (log-only email, no push without keys).
    const deliveries = await processDeliveries({ tenantId: tenant.data }).catch(() => null);
    return Response.json({ ...due, deliveries }, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch { return Response.json({ error: { code: 'internal_error', message: 'Calendar processing failed' } }, { status: 500 }); }
}
