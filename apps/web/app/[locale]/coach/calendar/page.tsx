import { and, asc, eq, isNull } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { clients, tenants } from '@dawlyy/db/schema';
import { localDateOf, zonedDueAt } from '@dawlyy/core/schedule';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requirePermission } from '@/src/server/require-permission';
import { forbidden } from '@/src/api/errors';
import { listCalendar } from '@/src/server/calendar/service';
import { CalendarScreen } from '@/components/calendar/calendar-screen';

/** Task 8: coach calendar reads scoped data under the same boundary as the calendar API. */
export default async function CalendarPage() {
  const auth = await requirePage();
  if (auth.role === 'client') throw forbidden(); requirePermission(auth, 'calendar', 'view');
  const data = await withAuthTx(auth, async tx => {
    const [tenant] = await tx.select({ timezone: clientColumns.tenants.timezone }).from(tenants).where(eq(tenants.id, auth.tenantId)).limit(1);
    const timezone = tenant?.timezone ?? 'Africa/Cairo';
    const today = localDateOf(new Date().toISOString(), timezone);
    const start = `${today.slice(0, 7)}-01`; const next = new Date(`${start}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    const events = await listCalendar(tx, auth, { from: zonedDueAt(start, '00:00', timezone), to: new Date(Date.parse(zonedDueAt(next.toISOString().slice(0, 10), '00:00', timezone)) - 1).toISOString(), limit: '100' });
    const rows = await tx.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, displayName: clients.displayName }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), isNull(clients.archivedAt))).orderBy(asc(clients.firstName), asc(clients.id));
    return { today, timezone, clients: rows.map(row => ({ id: row.id, name: row.displayName ?? [row.firstName, row.lastName].filter(Boolean).join(' ') })), initial: { ...events, items: events.items.map(({ id, clientId, type, state, dueAt, localDate, timezone: eventZone, windowDays, title }) => ({ id, clientId, type, state, dueAt: dueAt.toISOString(), localDate, timezone: eventZone, windowDays, title })) } };
  });
  return <CalendarScreen {...data} canEdit={isAllowed(auth, 'calendar', 'edit')} />;
}
