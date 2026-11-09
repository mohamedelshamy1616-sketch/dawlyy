import 'server-only';
import { and, asc, desc, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { packages } from '@dawlyy/db/schema';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { notFound, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { createPackageSchema, packageListSchema, updatePackageSchema } from './schemas';

/** Task 3: coach-only package row, including the immutable identity and timestamps. */
export type CoachPackage = typeof packages.$inferSelect;

async function readPackage(tx: Tx, id: string): Promise<CoachPackage> {
  const [row] = await tx.select().from(packages).where(eq(packages.id, id)).limit(1);
  if (!row) throw notFound('Package not found');
  return row;
}

/** Task 3: package detail through the caller's authenticated transaction. */
export async function getPackage(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'packages', 'view');
  return readPackage(tx, id);
}

/** Task 3: active packages precede archived ones; microsecond cursors preserve PostgreSQL ordering. */
export async function listPackages(tx: Tx, auth: AuthContext, input: z.input<typeof packageListSchema>) {
  requirePermission(auth, 'packages', 'view');
  const query = packageListSchema.parse(input);
  const { limit, cursor } = parseListQuery(query);
  const rank = sql<number>`case when ${packages.archivedAt} is null then 0 else 1 end`;
  const stamp = sql<string>`to_char(${packages.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  let position: SQL | undefined;
  if (cursor) {
    const parsed = z.object({ id: z.string().uuid(), k: z.string().regex(/^[01]\|/u) }).safeParse(cursor);
    if (!parsed.success) throw validationError(undefined, 'Invalid package cursor');
    const time = parsed.data.k.slice(2);
    if (!z.iso.datetime().safeParse(time).success) throw validationError(undefined, 'Invalid package cursor');
    const group = Number(parsed.data.k[0]);
    position = or(sql`${rank} > ${group}`, and(sql`${rank} = ${group}`, or(
      sql`${packages.createdAt} < ${time}::timestamptz`, and(sql`${packages.createdAt} = ${time}::timestamptz`, lt(packages.id, cursor.id)),
    )));
  }
  const rows = await tx.select({ row: packages, cursorStamp: stamp }).from(packages).where(and(
    query.archived === '1' ? undefined : isNull(packages.archivedAt), position,
  )).orderBy(asc(rank), desc(packages.createdAt), desc(packages.id)).limit(limit + 1);
  const result = page(rows.map(item => ({ ...item.row, cursorStamp: item.cursorStamp })), limit,
    row => `${row.archivedAt === null ? 0 : 1}|${row.cursorStamp}`);
  return { ...result, items: result.items.map(({ cursorStamp: _stamp, ...row }) => { void _stamp; return row; }) };
}

/** Task 3: create a flat package; all ownership and audit stamps are server controlled. */
export async function createPackage(tx: Tx, auth: AuthContext, input: z.output<typeof createPackageSchema>) {
  requirePermission(auth, 'packages', 'create');
  const { priceAmount, ...body } = createPackageSchema.parse(input);
  const [row] = await tx.insert(packages).values({ ...body, price: priceAmount, tenantId: auth.tenantId }).returning();
  if (!row) throw notFound('Package not found');
  return row;
}

/** Task 3: edit the master only; existing subscription snapshots remain unchanged. */
export async function updatePackage(tx: Tx, auth: AuthContext, id: string, input: z.output<typeof updatePackageSchema>) {
  requirePermission(auth, 'packages', 'edit');
  await readPackage(tx, id);
  const { priceAmount, ...body } = updatePackageSchema.parse(input);
  const [row] = await tx.update(packages).set({ ...body, ...(priceAmount === undefined ? {} : { price: priceAmount }) })
    .where(eq(packages.id, id)).returning();
  if (!row) throw notFound('Package not found');
  return row;
}

/** Task 3 / spec §30: archive instead of deleting any package or subscription history. */
export async function archivePackage(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'packages', 'edit');
  const row = await readPackage(tx, id);
  if (row.archivedAt !== null) return row;
  const [updated] = await tx.update(packages).set({ archivedAt: new Date() }).where(eq(packages.id, id)).returning();
  if (!updated) throw notFound('Package not found');
  return updated;
}

/** Task 3: duplicate all package configuration into an independent active, private package. */
export async function duplicatePackage(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'packages', 'create');
  const original = await readPackage(tx, id);
  return createPackage(tx, auth, { name: original.name, description: original.description, priceAmount: original.price,
    currency: original.currency, durationDays: original.durationDays, graceDays: original.graceDays,
    entitlements: original.entitlements, scheduleRules: original.scheduleRules });
}
