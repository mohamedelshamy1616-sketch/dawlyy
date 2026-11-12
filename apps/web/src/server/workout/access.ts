import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { subscriptions, tenants, workoutSessions } from '@dawlyy/db/schema';
import { ApiError } from '../../api/errors';
import { checkActiveAccess } from '../access';
import type { AuthContext, Tx } from '../db';
import type { SessionWrite, SetWrite } from './contracts';
import { requireClient } from './portal';

type Window = { state: string; startsOn: string; endsOn: string; graceEndsOn: string | null; pausedAt: Date | null };
function covered(start: Date | null, window: Window, timezone: string): boolean {
  if (!start || !['active', 'grace', 'expired', 'paused'].includes(window.state)) return false;
  if (window.state === 'paused' && (!window.pausedAt || start >= window.pausedAt)) return false;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(start);
  const date = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value ?? '').join('-');
  return date >= window.startsOn && date <= (window.graceEndsOn && window.graceEndsOn > window.endsOn ? window.graceEndsOn : window.endsOn);
}

/** P7 D2: null means current access; otherwise only these existing-session UUIDs may sync after expiry/freeze. */
export async function assertWorkoutSyncAccess(tx: Tx, auth: AuthContext, body: { sessions: SessionWrite[]; sets: SetWrite[] }): Promise<Set<string> | null> {
  const clientId = requireClient(auth, true);
  const decision = await checkActiveAccess(tx, auth);
  if (decision.allowed) return null;
  const denied = () => new ApiError(403, 'access_expired', 'Active subscription required', decision.details);
  const uuids = [...new Set([...body.sessions.map(row => row.clientUuid), ...body.sets.map(row => row.sessionClientUuid)])];
  if (!uuids.length) throw denied();
  const sessions = await tx.select({ clientUuid: clientColumns.workoutSessions.clientUuid, startedAt: clientColumns.workoutSessions.startedAt,
    createdAt: clientColumns.workoutSessions.createdAt })
    .from(workoutSessions).where(and(eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.clientId, clientId), inArray(workoutSessions.clientUuid, uuids)));
  const [tenant] = await tx.select({ timezone: clientColumns.tenants.timezone }).from(tenants).where(eq(tenants.id, auth.tenantId)).limit(1);
  if (!tenant) throw denied();
  const windows = await tx.select({ state: clientColumns.subscriptions.state, startsOn: clientColumns.subscriptions.startsOn,
    endsOn: clientColumns.subscriptions.endsOn, graceEndsOn: clientColumns.subscriptions.graceEndsOn, pausedAt: clientColumns.subscriptions.pausedAt,
  }).from(subscriptions).where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.clientId, clientId)));
  const eligible = new Set<string>();
  for (const session of sessions) {
    const edits = body.sessions.filter(row => row.clientUuid === session.clientUuid);
    // The UI queues its first start offline. It may fill an unset start only for
    // an already-existing session, after its server creation, inside the window.
    const offlineStart = edits.find(edit => edit.startedAt)?.startedAt;
    const start = session.startedAt ?? (offlineStart ? new Date(offlineStart) : null);
    if (!session.startedAt && (!start || start < session.createdAt)) continue;
    // A backdated upload cannot replace an already-recorded ineligible start.
    if (!windows.some(window => covered(start, window, tenant.timezone))) continue;
    if (edits.some(edit => edit.startedAt !== undefined && !windows.some(window => covered(edit.startedAt ? new Date(edit.startedAt) : null, window, tenant.timezone)))) continue;
    eligible.add(session.clientUuid);
  }
  if (!eligible.size) throw denied();
  return eligible;
}
