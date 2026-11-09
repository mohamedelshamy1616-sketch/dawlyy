import 'server-only';
import { and, desc, eq, getTableColumns, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { clients, exercises, memberships, programs, programVersions } from '@dawlyy/db/schema';
import { programStats, validateProgram } from '@dawlyy/core/program-edit';
import type { ProgramDocument } from '@dawlyy/core/types';
import { diffDocuments, summarizeDiff } from '@dawlyy/core/versioning';
import { searchKey } from '@dawlyy/core/text';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { forbidden, notFound, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { documentRevision, exerciseReferences } from './helpers';
import type { programListSchema } from './schemas';
import { isAllowed, type Action } from '@dawlyy/core/authz';

const cursorTime = z.iso.datetime({ precision: 6 }).refine(value => !value.startsWith('0000-'));

/** Task 4: core permits client program viewing, but this router is exclusively the coach workspace. */
export function requireProgramPermission(auth: AuthContext, action: Action): void {
  if (auth.role === 'client') throw forbidden();
  requirePermission(auth, 'programs', action);
}

/** Task 4: resolve a head under RLS; inaccessible programs are indistinguishable from missing ones. */
export async function programHead(tx: Tx, auth: AuthContext, id: string, action: Action = 'view') {
  requireProgramPermission(auth, action);
  const [head] = await tx.select().from(programs).where(and(eq(programs.id, id), eq(programs.tenantId, auth.tenantId))).limit(1);
  if (!head) throw notFound('Program not found');
  return head;
}

/** Doc §12.1 item 3: resolve all JSON exercise ids, including alternatives, through caller RLS. */
export async function programIssues(tx: Tx, document: ProgramDocument) {
  const ids = exerciseReferences(document);
  // Core's generic Id also accepts non-UUID identifiers; never pass those to a UUID database comparison.
  const validIds = ids.filter(id => z.string().uuid().safeParse(id).success);
  const known = validIds.length ? await tx.select({ id: exercises.id }).from(exercises).where(inArray(exercises.id, validIds)) : [];
  return validateProgram(document, { knownExerciseIds: new Set(known.map(row => row.id)) });
}

/** Task 4: coach detail includes a current snapshot, semantic validation and pure core statistics. */
export async function getProgram(tx: Tx, auth: AuthContext, id: string, action: Action = 'view') {
  const head = await programHead(tx, auth, id, action);
  const pointer = head.currentVersionId ?? head.publishedVersionId;
  const [version] = pointer ? await tx.select().from(programVersions).where(and(eq(programVersions.programId, id), eq(programVersions.id, pointer))).limit(1) : [];
  if (!version) throw notFound('Program version not found');
  const references = exerciseReferences(version.document).filter(value => z.string().uuid().safeParse(value).success);
  const names = references.length ? await tx.select({ id: exercises.id, name: exercises.name }).from(exercises).where(inArray(exercises.id, references)) : [];
  const [published] = head.publishedVersionId ? await tx.select({ versionNo: programVersions.versionNo }).from(programVersions).where(and(eq(programVersions.programId, id), eq(programVersions.id, head.publishedVersionId))).limit(1) : [];
  return { head, currentVersion: version, publishedVersionNo: published?.versionNo ?? null,
    stats: programStats(version.document), issues: await programIssues(tx, version.document),
    revision: documentRevision({ id: version.id, status: version.status, document: version.document }),
    exerciseNames: Object.fromEntries(names.map(row => [row.id, row.name])) };
}

/** Task 4: cursor pagination is applied in SQL before mapping documents to card statistics. */
export async function listPrograms(tx: Tx, auth: AuthContext, query: z.infer<typeof programListSchema>) {
  requireProgramPermission(auth, 'view');
  const { limit, cursor } = parseListQuery(query);
  const stamp = sql`coalesce(${programs.updatedAt}, ${programs.createdAt})`;
  // Preserve Postgres microseconds: a JavaScript Date would truncate a same-timestamp page boundary.
  const sortKey = sql<string>`to_char(${stamp} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  if (cursor) {
    if (typeof cursor.k !== 'string' || !cursorTime.safeParse(cursor.k).success || !z.string().uuid().safeParse(cursor.id).success) throw validationError(undefined, 'Invalid program cursor');
  }
  const working = alias(programVersions, 'working_version');
  const published = alias(programVersions, 'published_version');
  const folded = sql`regexp_replace(translate(regexp_replace(lower(concat_ws(' ', ${programs.name}->>'ar', ${programs.name}->>'en')), ${'[\u0640\u064b-\u065f\u0670\u06d6-\u06ed\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]'}, '', 'g'), 'أإآٱىئةؤ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', 'ااااييهو01234567890123456789'), '[[:punct:][:space:]]+', ' ', 'g')`;
  const q = searchKey(query.q ?? '');
  const rows = await tx.select({ ...getTableColumns(programs), sortAt: sortKey,
    document: working.document, currentStatus: working.status, currentVersionNo: working.versionNo,
    publishedVersionNo: published.versionNo,
    assignedClientsCount: sql<number>`(select count(distinct assigned_program.client_id)::int from public.programs assigned_program where assigned_program.template_id = ${programs.id} and assigned_program.archived_at is null)`.mapWith(Number),
  }).from(programs)
    .leftJoin(working, and(eq(working.programId, programs.id), eq(working.id, programs.currentVersionId)))
    .leftJoin(published, and(eq(published.programId, programs.id), eq(published.id, programs.publishedVersionId)))
    .where(and(eq(programs.tenantId, auth.tenantId), query.kind ? eq(programs.kind, query.kind) : undefined,
      query.clientId ? eq(programs.clientId, query.clientId) : undefined,
      query.archived === 'true' ? isNotNull(programs.archivedAt) : isNull(programs.archivedAt),
      q ? sql`position(${q} in ${folded}) > 0` : undefined,
      cursor ? or(sql`${stamp} < ${cursor.k}::timestamptz`, and(sql`${stamp} = ${cursor.k}::timestamptz`, lt(programs.id, cursor.id))) : undefined))
    .orderBy(desc(stamp), desc(programs.id)).limit(limit + 1);
  return page(rows.map(({ document, currentStatus, currentVersionNo, ...head }) => ({ ...head,
    currentVersion: currentStatus === null ? null : { status: currentStatus, versionNo: currentVersionNo },
    stats: document ? programStats(document) : null,
  })), limit, row => row.sortAt);
}

/** Task 4: RLS-scoped historic version lookup for the coach and compare/revert flows. */
export async function getProgramVersion(tx: Tx, auth: AuthContext, id: string, versionNo: number, action: Action = 'view') {
  await programHead(tx, auth, id, action);
  const [version] = await tx.select().from(programVersions).where(and(eq(programVersions.programId, id), eq(programVersions.versionNo, versionNo))).limit(1);
  if (!version) throw notFound('Version not found');
  return version;
}

/** Task 4: history includes author display names and a summary against each immediately preceding version. */
export async function listProgramVersions(tx: Tx, auth: AuthContext, id: string, query: { limit?: string; cursor?: string }) {
  await programHead(tx, auth, id);
  const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'number' || !Number.isSafeInteger(cursor.k) || cursor.k < 1 || cursor.k > 2147483647 || !z.string().uuid().safeParse(cursor.id).success)) throw validationError(undefined, 'Invalid version cursor');
  const rows = await tx.select({ ...getTableColumns(programVersions), publishedByName: memberships.displayName })
    .from(programVersions).leftJoin(memberships, and(eq(memberships.tenantId, programVersions.tenantId), eq(memberships.userId, programVersions.publishedBy)))
    .where(and(eq(programVersions.programId, id), cursor ? or(lt(programVersions.versionNo, Number(cursor.k)), and(eq(programVersions.versionNo, Number(cursor.k)), lt(programVersions.id, cursor.id))) : undefined))
    .orderBy(desc(programVersions.versionNo), desc(programVersions.id)).limit(limit + 1);
  const mapped = [];
  for (const row of rows) {
    const [previous] = await tx.select({ document: programVersions.document }).from(programVersions).where(and(eq(programVersions.programId, id), lt(programVersions.versionNo, row.versionNo))).orderBy(desc(programVersions.versionNo)).limit(1);
    const { document, ...metadata } = row;
    mapped.push({ ...metadata, diffSummary: summarizeDiff(diffDocuments(previous?.document ?? {}, document)) });
  }
  return page(mapped, limit, row => row.versionNo);
}

/** Task 4: compare existing snapshots without mutating or re-normalizing either document. */
export async function programDiff(tx: Tx, auth: AuthContext, id: string, a: number, b: number) {
  const before = await getProgramVersion(tx, auth, id, a);
  const after = await getProgramVersion(tx, auth, id, b);
  return diffDocuments(before.document, after.document, { flavor: 'program' });
}

/** Task 4: minimal RLS-scoped assignment picker; program editors need no client-directory module grant. */
export async function listProgramAssignmentClients(tx: Tx, auth: AuthContext, id: string, query: { q?: string; limit?: string; cursor?: string }) {
  await programHead(tx, auth, id, isAllowed(auth, 'programs', 'publish') ? 'publish' : 'edit');
  const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'string' || !cursorTime.safeParse(cursor.k).success || !z.string().uuid().safeParse(cursor.id).success)) throw validationError(undefined, 'Invalid client cursor');
  const q = searchKey(query.q ?? '');
  const found = await tx.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, displayName: clients.displayName, code: clients.code,
    cursorStamp: sql<string>`to_char(${clients.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` })
    .from(clients).where(and(eq(clients.tenantId, auth.tenantId), isNull(clients.archivedAt), q ? or(sql`position(${q} in ${clients.searchKey}) > 0`, sql`position(${q} in replace(lower(${clients.code}), '-', ' ')) > 0`) : undefined,
      cursor ? or(sql`${clients.createdAt} < ${cursor.k}::timestamptz`, and(sql`${clients.createdAt} = ${cursor.k}::timestamptz`, lt(clients.id, cursor.id))) : undefined))
    .orderBy(desc(clients.createdAt), desc(clients.id)).limit(limit + 1);
  const result = page(found, limit, row => row.cursorStamp);
  return { ...result, items: result.items.map(({ cursorStamp, ...row }) => { void cursorStamp; return row; }) };
}
