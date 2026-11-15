import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext, Tx } from '../db';
import { listActivity } from './read';
import { ACTIVITY_ENTITY_NAMES } from './types';
import { decodeActivityCursor, encodeActivityCursor, parseActivityQuery } from './schemas';
import { resolveActivityLinks } from './links';

vi.mock('./links', async original => ({ ...await original<typeof import('./links')>(), resolveActivityLinks: vi.fn() }));
const uuid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const owner: AuthContext = { tenantId: uuid, userId: uuid, membershipId: uuid, role: 'owner', permissions: null };
const staff: AuthContext = { ...owner, role: 'staff', permissions: { client_scope: 'all', modules: { clients: ['view'] } } };
const stamp = '2026-11-15T00:00:00.123456Z';
const row = (id = '9007199254740993', changes: Record<string, unknown> = {}) => ({
  id, createdAt: stamp, clientId: uuid, actorUserId: uuid, actorRole: 'owner', actorDisplayName: 'Coach',
  action: 'archive', entity: 'clients', entityId: uuid, ...changes,
});
const dialect = new PgDialect();
function transaction(results: unknown[][]) {
  const execute = vi.fn(async (_query: SQL) => results.shift() ?? []);
  return { tx: { execute } as unknown as Tx, execute };
}
beforeEach(() => vi.mocked(resolveActivityLinks).mockReset().mockResolvedValue(new Map()));

describe('R3b strict query and exact activity cursor', () => {
  it('uses default 50, accepts both limit boundaries and every known entity', () => {
    expect(parseActivityQuery({})).toMatchObject({ limit: 50, cursor: null });
    expect(parseActivityQuery({ limit: '1' }).limit).toBe(1);
    expect(parseActivityQuery({ limit: '100' }).limit).toBe(100);
    for (const entity of ACTIVITY_ENTITY_NAMES) expect(parseActivityQuery({ entity }).entity).toBe(entity);
  });
  it.each(['', '0', '101', '-1', '1.5', '01', '1e2', ' 2', 'NaN', 'Infinity'])('rejects malformed or out-of-range limit %j', limit => {
    expect(() => parseActivityQuery({ limit })).toThrow(expect.objectContaining({ status: 400 }));
  });
  it('rejects unknown query keys, malformed UUIDs and unknown or unsafe entities', () => {
    for (const query of [{ extra: 'bad' }, { clientId: 'bad' }, { entity: 'memberships' }, { entity: 'clients;drop table' }]) {
      expect(() => parseActivityQuery(query)).toThrow(expect.objectContaining({ status: 400 }));
    }
  });
  it('round trips timestamp microseconds and bigint IDs above Number.MAX_SAFE_INTEGER as exact text', () => {
    const encoded = encodeActivityCursor({ id: '9223372036854775807', createdAt: stamp }, { clientId: uuid, entity: 'clients' });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeActivityCursor(encoded, { clientId: uuid, entity: 'clients' })).toEqual({ v: 1, t: stamp, id: '9223372036854775807', clientId: uuid, entity: 'clients' });
  });
  it('rejects cursor reuse with changed filters but permits a different page size', () => {
    const cursor = encodeActivityCursor({ id: '99', createdAt: stamp }, { clientId: uuid, entity: 'clients' });
    for (const query of [{ clientId: other, entity: 'clients' }, { clientId: uuid, entity: 'payments' }, {}]) {
      expect(() => decodeActivityCursor(cursor, query)).toThrow(expect.objectContaining({ status: 400 }));
    }
    expect(parseActivityQuery({ cursor, clientId: uuid, entity: 'clients', limit: '100' }).limit).toBe(100);
  });
  it.each([
    '', '%%%', 'e30=', Buffer.from('null').toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, t: '0000-01-01T00:00:00.123456Z', id: '1', clientId: null, entity: null })).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, t: stamp, id: 9007199254740992, clientId: null, entity: null })).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, t: stamp, id: '9223372036854775808', clientId: null, entity: null })).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, t: '2026-02-30T00:00:00.123456Z', id: '1', clientId: null, entity: null })).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, t: stamp, id: '1', clientId: null, entity: null, href: 'https://bad.example' })).toString('base64url'),
  ])('rejects malformed, noncanonical or forged cursor metadata %j', cursor => {
    expect(() => parseActivityQuery({ cursor })).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('R3b authenticated activity metadata reader (SQL decisions, not RLS proof)', () => {
  it('refuses client role and missing clients view before querying', async () => {
    const { tx, execute } = transaction([]);
    await expect(listActivity(tx, { ...owner, role: 'client', clientId: uuid }, {})).rejects.toMatchObject({ status: 403 });
    await expect(listActivity(tx, { ...staff, permissions: { client_scope: 'all', modules: {} } }, {})).rejects.toMatchObject({ status: 403 });
    expect(execute).not.toHaveBeenCalled();
  });
  it('checks explicit client existence under RLS and returns 404 for inaccessible or nonexistent clients', async () => {
    const { tx, execute } = transaction([[]]);
    await expect(listActivity(tx, owner, { clientId: uuid })).rejects.toMatchObject({ status: 404 });
    expect(execute).toHaveBeenCalledTimes(1);
    const sql = dialect.sqlToQuery(execute.mock.calls[0]![0]!);
    expect(sql.sql).toContain('from public.clients');
    expect(sql.params).toContain(owner.tenantId);
    expect(sql.params).toContain(uuid);
    expect(sql.sql).not.toContain('archived_at');
  });
  it('retains access to visible empty and archived client history without active-access lookups', async () => {
    const { tx, execute } = transaction([[{ id: uuid }], []]);
    expect(await listActivity(tx, staff, { clientId: uuid })).toEqual({ items: [], nextCursor: null });
    const sql = execute.mock.calls.map(call => dialect.sqlToQuery(call[0]!).sql).join('\n');
    expect(sql).not.toContain('subscriptions');
    expect(sql).not.toContain('status = \'active\' and c.');
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('selects only DTO metadata, stripping payloads, reasons, requests, tokens and actor contacts', async () => {
    const { tx, execute } = transaction([[row(undefined, { before: { medical: 'secret' }, after: { email: 'secret' }, reason: 'secret', requestId: 'secret', token: 'secret', actorEmail: 'secret' })]]);
    vi.mocked(resolveActivityLinks).mockResolvedValue(new Map([['9007199254740993', { href: '/coach/clients/' + uuid, version: null }]]));
    const result = await listActivity(tx, owner, {});
    expect(Object.keys(result.items[0]!).sort()).toEqual(['action', 'actor', 'clientId', 'createdAt', 'entity', 'entityId', 'href', 'id', 'version']);
    expect(result.items[0]?.actor).toEqual({ userId: uuid, displayName: 'Coach', role: 'owner' });
    expect(JSON.stringify(result)).not.toContain('secret');
    const sql = dialect.sqlToQuery(execute.mock.calls[0]![0]!).sql;
    expect(sql).toContain('a.id::text');
    expect(sql).toContain('US');
    expect(sql).toContain('left join public.memberships actor');
    expect(sql).toContain("actor.status = 'active'");
    expect(sql).not.toMatch(/select\s+(?:a\.)?\*/i);
    expect(sql).not.toMatch(/(?:a\.before|a\.after)\s+as/i);
    expect(sql).not.toContain('request_id');
  });
  it('projects version approval, publication and archival transitions from safe status flags before DTO construction', async () => {
    const { tx, execute } = transaction([[row('3', { entity: 'program_versions', action: 'approve' }), row('2', { entity: 'nutrition_plan_versions', action: 'publish' }), row('1', { entity: 'form_versions', action: 'archive' })]]);
    const result = await listActivity(tx, owner, {});
    expect(result.items.map(item => item.action)).toEqual(['approve', 'publish', 'archive']);
    const query = dialect.sqlToQuery(execute.mock.calls[0]![0]!).sql;
    expect(query).toContain("a.entity in ('program_versions','nutrition_plan_versions','form_versions')");
    expect(query).toContain("a.before->>'status' is distinct from a.after->>'status'");
    expect(query).toContain("when 'approved' then 'approve' when 'published' then 'publish' when 'archived' then 'archive'");
    expect(JSON.stringify(result)).not.toContain('status');
  });
  it('keeps null actor names for localized fallback and never fills them from a privileged source', async () => {
    const { tx } = transaction([[row('1', { actorUserId: null, actorRole: null, actorDisplayName: null }), row('2', { actorDisplayName: null, actorRole: 'staff' })]]);
    const result = await listActivity(tx, owner, {});
    expect(result.items[0]?.actor).toEqual({ userId: null, displayName: null, role: null });
    expect(result.items[1]?.actor.displayName).toBeNull();
    const source = readFileSync(new URL('./read.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('withServiceTx');
    expect(source).not.toContain('fetch(');
  });
  it('applies module authorization and the staff non-null-client predicate before ordering and limit', async () => {
    const limited = transaction([[]]); const business = transaction([[]]);
    await listActivity(limited.tx, staff, {});
    await listActivity(business.tx, owner, {});
    const scoped = dialect.sqlToQuery(limited.execute.mock.calls[0]![0]!);
    const full = dialect.sqlToQuery(business.execute.mock.calls[0]![0]!);
    expect(scoped.sql).toContain('a.client_id is not null');
    expect(full.sql).not.toContain('and a.client_id is not null');
    expect(scoped.sql.indexOf('a.client_id is not null')).toBeLessThan(scoped.sql.indexOf('order by a.created_at'));
    expect(scoped.params).toContain(owner.tenantId);
    expect(scoped.sql).toContain('limit');
    expect(scoped.params.at(-1)).toBe(51);
    expect(full.params.length).toBeGreaterThan(scoped.params.length);
  });
  it('returns the cursor of the last returned row only when an extra authorized row exists', async () => {
    const { tx, execute } = transaction([[row('12'), row('11'), row('10')]]);
    const result = await listActivity(tx, owner, { limit: '2', entity: 'clients' });
    expect(result.items.map(item => item.id)).toEqual(['12', '11']);
    expect(decodeActivityCursor(result.nextCursor!, { entity: 'clients' })).toMatchObject({ id: '11', t: stamp });
    expect(vi.mocked(resolveActivityLinks).mock.calls[0]?.[2]).toHaveLength(2);
    expect(dialect.sqlToQuery(execute.mock.calls[0]![0]!).params.at(-1)).toBe(3);
    const tail = transaction([[row('10')]]);
    expect((await listActivity(tail.tx, owner, { limit: '2', cursor: result.nextCursor!, entity: 'clients' })).nextCursor).toBeNull();
  });
  it('uses native numeric bigint tie-breaks and parameterized exact timestamps across equal-time pages and a new insert', async () => {
    // The harness models the database tuple predicate; SQL assertions below pin its actual native types.
    let records = [row('9007199254740995'), row('9007199254740994'), row('9007199254740993'), row('12'), row('9')];
    const execute = vi.fn(async (query: SQL) => {
      const compiled = dialect.sqlToQuery(query);
      const timestamp = compiled.params.find(value => value === stamp);
      const cursorId = compiled.params.find(value => typeof value === 'string' && /^900719925474099[0-9]$/.test(value));
      return records.filter(record => timestamp === undefined || BigInt(record.id) < BigInt(String(cursorId))).slice(0, Number(compiled.params.at(-1)));
    });
    const tx = { execute } as unknown as Tx;
    const first = await listActivity(tx, owner, { limit: '2' });
    records = [row('9007199254740996'), ...records];
    const second = await listActivity(tx, owner, { limit: '2', cursor: first.nextCursor! });
    expect(first.items.map(item => item.id)).toEqual(['9007199254740995', '9007199254740994']);
    expect(second.items.map(item => item.id)).toEqual(['9007199254740993', '12']);
    const sql = dialect.sqlToQuery(execute.mock.calls[1]![0]!);
    expect(sql.sql).toMatch(/\(a\.created_at, a\.id\) < \(\$\d+::timestamptz, \$\d+::bigint\)/);
    expect(sql.params).toContain(stamp);
    expect(sql.params).toContain('9007199254740994');
    expect(sql.sql).toContain('order by a.created_at desc, a.id desc');
  });
});
