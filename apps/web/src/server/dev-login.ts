import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, like } from 'drizzle-orm';
import { clientColumns, withServiceTx } from '@dawlyy/db';
import { memberships, tenants } from '@dawlyy/db/schema';

const SESSION_SECONDS = 12 * 60 * 60;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** doc §14 / P2B local testing: development-only cookie marker; never import this module in production. */
export const DEV_SESSION_COOKIE = 'dawlyy_dev_session';

/** doc §14 / P2B local testing: demo membership information, without tokens or permissions. */
export type DemoUser = {
  userId: string;
  displayName: string;
  role: 'owner' | 'staff' | 'client';
  tenantName: string;
};

/** doc §14 / P2B local testing: require nonproduction, the exact opt-in and a 32-character secret. */
export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== 'production'
    && process.env.DAWLYY_DEV_LOGIN === '1'
    && (process.env.DAWLYY_DEV_LOGIN_SECRET?.length ?? 0) >= 32;
}

function signature(payload: string): Buffer {
  return createHmac('sha256', process.env.DAWLYY_DEV_LOGIN_SECRET!).update(payload).digest();
}

/** doc §14 / P2B local testing: sign a UUID for twelve hours from `now`; disabled or invalid input returns null. */
export function signDevSession(userId: string, now: Date = new Date()): string | null {
  if (!devLoginEnabled() || !USER_ID.test(userId)) return null;
  const expiry = Math.floor(now.getTime() / 1000) + SESSION_SECONDS;
  if (!Number.isSafeInteger(expiry) || expiry <= 0) return null;
  const payload = `${userId}.${expiry}`;
  return `${payload}.${signature(payload).toString('hex')}`;
}

/** doc §14 / P2B local testing: verify an unexpired cookie with a constant-time MAC comparison, or return null. */
export function readDevSession(cookieValue: string | null | undefined, now: Date = new Date()): string | null {
  if (!devLoginEnabled() || !cookieValue || cookieValue.length > 128) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiryText, mac] = parts;
  if (!userId || !USER_ID.test(userId) || !expiryText || !/^[1-9]\d{0,12}$/.test(expiryText)
    || !mac || !/^[0-9a-f]{64}$/.test(mac)) return null;
  const expiry = Number(expiryText);
  const seconds = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(expiry) || !Number.isSafeInteger(seconds) || expiry <= seconds) return null;
  const expected = signature(`${userId}.${expiryText}`);
  return timingSafeEqual(expected, Buffer.from(mac, 'hex')) ? userId : null;
}

/** doc §14 / P2B local testing: service-only discovery of active memberships belonging to demo-prefixed tenants. */
export async function listDemoUsers(): Promise<DemoUser[]> {
  if (!devLoginEnabled()) return [];
  const users = await withServiceTx(null, 'dev login: list demo users', (tx) => tx
    .select({
      userId: clientColumns.memberships.userId,
      displayName: clientColumns.memberships.displayName,
      role: clientColumns.memberships.role,
      tenantName: clientColumns.tenants.name,
    })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(and(eq(memberships.status, 'active'), like(tenants.slug, 'demo%')))
    .orderBy(asc(memberships.createdAt), asc(memberships.id)));
  if (!devLoginEnabled()) return [];
  return users.map((user) => ({ ...user, displayName: user.displayName ?? user.userId }));
}

/**
 * Local testing of invitation acceptance: a development identity that holds no membership anywhere yet.
 * Any identity that already belongs to a tenant must come from the demo list, so this can never impersonate a
 * member of a non-demo tenant.
 */
export async function isUnattachedIdentity(userId: string): Promise<boolean> {
  if (!devLoginEnabled() || !USER_ID.test(userId)) return false;
  const rows = await withServiceTx(null, 'dev login: check that an invitee identity has no membership', (tx) => tx
    .select({ id: clientColumns.memberships.id })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1));
  return devLoginEnabled() && rows.length === 0;
}
