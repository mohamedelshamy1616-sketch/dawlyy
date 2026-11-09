import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { closeDb, type AuthContext } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkClient, mkMembership } from './factories';
import { as, svc, q, one, expectCode, expectGuard, expectPrivilege, expectRls, serviceRow } from './helpers';

beforeAll(async () => { await buildFixture(); });
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id).sort();
const tables = ['conversations', 'messages', 'message_revisions', 'audit_log', 'events'] as const;
async function snapshot(f: Fixture): Promise<unknown[]> {
  return svc(async (tx) => {
    const result: unknown[] = [];
    for (const table of tables) result.push(await q(tx, sql`select to_jsonb(t) as row from ${sql.identifier(table)} t
      where tenant_id in (${f.t1}::uuid, ${f.t2}::uuid) order by to_jsonb(t)::text collate "C"`));
    return result;
  });
}
function insertMessage(f: Fixture, id: string, conversationId = f.convA, extra: Record<string, SQL> = {}): SQL {
  const values: Record<string, SQL> = { id: sql`${id}::uuid`, tenant_id: sql`${f.t1}::uuid`,
    conversation_id: sql`${conversationId}::uuid`, sender_user_id: sql`${f.ua.userId}::uuid`,
    sender_role: sql`'client'`, body: sql`'original'`, client_uuid: sql`${randomUUID()}::uuid`, ...extra };
  return sql`insert into messages (${sql.join(Object.keys(values).map(sql.identifier), sql`, `)})
    values (${sql.join(Object.values(values), sql`, `)}) returning *`;
}
async function message(f: Fixture, ctx: AuthContext = f.ua, conversationId = f.convA): Promise<string> {
  const id = randomUUID();
  await as(ctx, (tx) => q(tx, insertMessage(f, id, conversationId)));
  return id;
}
async function refuse(f: Fixture, work: () => Promise<unknown>, rule: string, column?: string, code = '42501', table = 'messages'): Promise<void> {
  const before = await snapshot(f);
  const error = await expectGuard(work, rule, column);
  expect(error.code).toBe(code);
  expect(error.table_name).toBe(table);
  expect(await snapshot(f)).toEqual(before);
}
async function edit(actor: AuthContext, id: string, body = 'allowed'): Promise<void> {
  await as(actor, async (tx) => {
    const row = await one<{ body: string; exact_time: boolean }>(tx, sql`update messages set body = ${body}
      where id = ${id} returning body, edited_at = now() as exact_time`);
    expect(row).toEqual({ body, exact_time: true });
  });
  expect(await serviceRow('messages', id)).toMatchObject({ body });
}
async function mark(actor: AuthContext, id: string): Promise<void> {
  const column = actor.role === 'client' ? 'read_by_client_at' : 'read_by_coach_at';
  await as(actor, async (tx) => {
    expect(await one(tx, sql`update messages set ${sql.identifier(column)} = now() where id = ${id}
      returning ${sql.identifier(column)} is not null as marked`)).toEqual({ marked: true });
  });
}

describe('documents §7.4 / §9.1: messaging', () => {
  for (const who of ['ua', 'ub', 's1', 's2', 'o1', 'o2'] as const) {
    it(`M01 conversations/messages ${who} SELECT id own/assigned/internal/T2`, async () => {
      const f = await buildPrivateFixture();
      const a = await message(f), b = await message(f, f.ub, f.convB), internal = await message(f, f.s1, f.convInternal);
      const c = randomUUID();
      await as(f.uc, (tx) => q(tx, insertMessage(f, c, f.convC, { tenant_id: sql`${f.t2}::uuid` })));
      const expected = {
        ua: [[f.convA], [a]], ub: [[f.convB], [b]], s1: [[f.convA, f.convInternal], [a, internal]],
        s2: [[f.convA, f.convB, f.convInternal], [a, b, internal]],
        o1: [[f.convA, f.convB, f.convInternal], [a, b, internal]], o2: [[f.convC], [c]],
      }[who];
      expect(ids(await as(f[who], (tx) => q<{ id: string }>(tx, sql`select id from conversations`)))).toEqual([...expected[0]!].sort());
      expect(ids(await as(f[who], (tx) => q<{ id: string }>(tx, sql`select id from messages`)))).toEqual([...expected[1]!].sort());
      expect(await serviceRow('messages', internal)).toMatchObject({ client_id: null });
    });
  }
  for (const column of ['body', 'attachments', 'deleted_at'] as const) {
    it(`M02 messages ua UPDATE ${column} received/live`, async () => {
      const f = await buildPrivateFixture(), id = await message(f, f.s1);
      const value = column === 'body' ? sql`'forged'` : column === 'attachments' ? sql`'[{"kind":"file"}]'::jsonb` : sql`now()`;
      await refuse(f, () => as(f.ua, (tx) => q(tx, sql`update messages set ${sql.identifier(column)} = ${value} where id = ${id}`)), 'rule:app.message_rules', column);
      await mark(f.ua, id);
      const own = await message(f);
      await edit(f.ua, own, 'edited');
      await as(f.ua, async (tx) => {
        expect(await one(tx, sql`update messages set attachments = '[{"kind":"file","name":"edit"}]'::jsonb where id = ${own}
          returning attachments, edited_at = now() as stamped`)).toEqual({ attachments: [{ kind: 'file', name: 'edit' }], stamped: true });
      });
    });
  }
  for (const who of ['ua', 's1'] as const) {
    it(`M03 messages ${who} UPDATE own read marker null/read bulk`, async () => {
      const f = await buildPrivateFixture();
      await message(f); await message(f, f.s1);
      const own = who === 'ua' ? 'read_by_client_at' : 'read_by_coach_at';
      const other = who === 'ua' ? 'read_by_coach_at' : 'read_by_client_at';
      await as(f[who], async (tx) => {
        const rows = await q(tx, sql`update messages set ${sql.identifier(own)} = '2099-01-01' where conversation_id = ${f.convA}
          and ${sql.identifier(own)} is null returning id, ${sql.identifier(own)} = now() as stamped, ${sql.identifier(other)} as other`);
        expect(rows).toHaveLength(2); for (const row of rows) expect(row).toMatchObject({ stamped: true, other: null });
      });
      const before = await snapshot(f);
      await as(f[who], (tx) => q(tx, sql`update messages set ${sql.identifier(own)} = '2099-02-01' where conversation_id = ${f.convA}`));
      expect(await snapshot(f)).toEqual(before);
      for (const [column, value] of [[own, sql`null`], [other, sql`now()`]] as const) {
        await refuse(f, () => as(f[who], (tx) => q(tx, sql`update messages set ${sql.identifier(column)} = ${value} where conversation_id = ${f.convA}`)), 'rule:app.message_rules', column);
        await as(f[who], (tx) => q(tx, sql`update messages set ${sql.identifier(own)} = now() where conversation_id = ${f.convA}`));
        expect(await snapshot(f)).toEqual(before);
      }
    });
  }
  for (const column of ['body', 'attachments', 'deleted_at', 'undelete'] as const) {
    it(`M04 messages ua UPDATE ${column} soft-deleted`, async () => {
      const f = await buildPrivateFixture(), id = await message(f);
      await as(f.ua, (tx) => q(tx, sql`update messages set deleted_at = '2026-01-01T00:00:00Z' where id = ${id} returning id`));
      expect(await serviceRow('messages', id)).toMatchObject({ deleted_at: new Date('2026-01-01T00:00:00Z') });
      const target = column === 'undelete' ? 'deleted_at' : column;
      const value = column === 'body' ? sql`'changed'` : column === 'attachments' ? sql`'[{}]'::jsonb` : column === 'undelete' ? sql`null` : sql`'2026-02-01T00:00:00Z'::timestamptz`;
      await refuse(f, () => as(f.ua, (tx) => q(tx, sql`update messages set ${sql.identifier(target)} = ${value} where id = ${id}`)), 'rule:app.message_rules', target);
      await mark(f.ua, id);
    });
  }
  for (const table of ['messages', 'conversations'] as const) {
    it(`M04 ${table} ua DELETE physical live`, async () => {
      const f = await buildPrivateFixture(), id = await message(f), before = await snapshot(f);
      const error = await expectPrivilege(() => as(f.ua, (tx) => q(tx, sql`delete from ${sql.identifier(table)} where id = ${table === 'messages' ? id : f.convA}`)));
      expect(error.message).toMatch(new RegExp(`permission denied for table ${table}`));
      expect(await snapshot(f)).toEqual(before);
      await as(f.ua, (tx) => q(tx, sql`update messages set deleted_at = now() where id = ${id}`));
      expect(await serviceRow('messages', id)).toMatchObject({ deleted_at: expect.any(Date) });
    });
  }
  for (const [caseId, who, target] of [['M05', 'ua', 'convB'], ['M06', 'ua', 'convInternal'], ['M07', 's1', 'convB']] as const) {
    it(`${caseId} messages ${who} INSERT conversation_id invisible ${target}`, async () => {
      const f = await buildPrivateFixture(), id = randomUUID(), before = await snapshot(f);
      const error = await expectCode(() => as(f[who], (tx) => q(tx, insertMessage(f, id, f[target]))), '23503');
      expect(error).toMatchObject({ detail: 'rule:app.message_rules', table_name: 'messages', column_name: 'conversation_id' });
      expect(await snapshot(f)).toEqual(before); expect(await serviceRow('messages', id)).toBeUndefined();
      await as(f[who], (tx) => q(tx, insertMessage(f, id)));
      expect(await serviceRow('messages', id)).toMatchObject({ sender_user_id: f[who].userId, sender_role: f[who].role, client_id: f.clientA });
    });
  }
  for (const who of ['ua', 's1', 'o1'] as const) {
    for (const previous of ['empty', 'earlier'] as const) {
      it(`M08 messages ${who} INSERT sender/client/created_at forged ${previous}`, async () => {
        const f = await buildPrivateFixture(), id = randomUUID();
        if (previous === 'earlier') await svc((tx) => q(tx, sql`update conversations set last_message_at = '2001-01-01' where tenant_id = ${f.t1} and id = ${f.convA}`), f.t1);
        await as(f[who], async (tx) => {
          expect(await one(tx, sql`${insertMessage(f, id, f.convA, { sender_user_id: sql`${f.uc.userId}::uuid`, sender_role: sql`'intruder'`,
            client_id: sql`${f.clientC}::uuid`, created_at: sql`'2099-01-01'::timestamptz` })}`)).toMatchObject({ sender_user_id: f[who].userId, sender_role: f[who].role, client_id: f.clientA });
          expect(await one(tx, sql`select m.created_at = now() as message_time, c.last_message_at = now() as conversation_time
            from messages m join conversations c on c.id = m.conversation_id where m.id = ${id}`)).toEqual({ message_time: true, conversation_time: true });
        });
      });
    }
    for (const column of ['edited_at', 'deleted_at', 'read_by_client_at', 'read_by_coach_at'] as const) {
      it(`M08 messages ${who} INSERT ${column} non-null`, async () => {
        const f = await buildPrivateFixture(), id = randomUUID();
        await refuse(f, () => as(f[who], (tx) => q(tx, insertMessage(f, id, f.convA, { [column]: sql`now()` }))), 'rule:app.message_rules', column);
        await as(f[who], (tx) => q(tx, insertMessage(f, id)));
        expect(await serviceRow('messages', id)).toMatchObject({ edited_at: null, deleted_at: null, read_by_client_at: null, read_by_coach_at: null });
      });
    }
  }
  it('M09 conversations ua/s2 UPDATE counters/preview zero/client/reply', async () => {
    const f = await buildPrivateFixture();
    await as(f.ua, async (tx) => {
      await q(tx, insertMessage(f, randomUUID(), f.convA, { body: sql`'client'` }));
      expect(await one(tx, sql`select unread_for_coach, unread_for_client, last_message_preview, last_message_at = now() as stamped from conversations where id = ${f.convA}`))
        .toEqual({ unread_for_coach: 1, unread_for_client: 0, last_message_preview: 'client', stamped: true });
    });
    await as(f.s2, async (tx) => {
      await q(tx, insertMessage(f, randomUUID(), f.convA, { body: sql`'reply'` }));
      expect(await one(tx, sql`select unread_for_coach, unread_for_client, last_message_preview, last_message_at = now() as stamped from conversations where id = ${f.convA}`))
        .toEqual({ unread_for_coach: 1, unread_for_client: 1, last_message_preview: 'reply', stamped: true });
    });
    await as(f.s2, (tx) => q(tx, sql`update conversations set subject = 'allowed', archived_at = '2026-01-01T00:00:00Z', unread_for_coach = 0 where id = ${f.convA}`));
    expect(await serviceRow('conversations', f.convA)).toMatchObject({ subject: 'allowed', unread_for_coach: 0, archived_at: new Date('2026-01-01T00:00:00Z') });
  });
  for (const [who, column, value, rule, sent] of [
    ['ua', 'unread_for_client', sql`99`, 'update_to', '99'], ['ua', 'unread_for_client', sql`-1`, 'update_to', '-1'],
    ['ua', 'unread_for_coach', sql`0`, 'client_update', '0'], ['ua', 'subject', sql`'spoof'`, 'client_update', 'spoof'],
    ['ua', 'archived_at', sql`now()`, 'client_update', 'now'], ['s2', 'unread_for_client', sql`0`, 'staff_update', '0'],
  ] as const) {
    it(`M09 conversations ${who} UPDATE ${column} counter1/sent=${sent}`, async () => {
      const f = await buildPrivateFixture(); await message(f); await message(f, f.s2);
      await refuse(f, () => as(f[who], (tx) => q(tx, sql`update conversations set ${sql.identifier(column)} = ${value} where id = ${f.convA}`)), rule, column, '42501', 'conversations');
      const reset = who === 'ua' ? 'unread_for_client' : 'unread_for_coach';
      await as(f[who], (tx) => q(tx, sql`update conversations set ${sql.identifier(reset)} = 0 where id = ${f.convA}`));
      expect(await serviceRow('conversations', f.convA)).toMatchObject({ [reset]: 0 });
    });
  }
  it('M10 conversations svc/ua INSERT older then UPDATE body/delete newest live', async () => {
    const f = await buildPrivateFixture(), newest = randomUUID(), older = randomUUID();
    await svc(async (tx) => {
      await q(tx, insertMessage(f, newest, f.convA, { body: sql`'newest'`, created_at: sql`'2026-02-01T00:00:00Z'::timestamptz` }));
      await q(tx, insertMessage(f, older, f.convA, { body: sql`${'x'.repeat(160)}`, created_at: sql`'2026-01-01T00:00:00Z'::timestamptz` }));
    }, f.t1);
    expect(await serviceRow('conversations', f.convA)).toMatchObject({ last_message_preview: 'newest', last_message_at: new Date('2026-02-01T00:00:00Z'), unread_for_coach: 2 });
    await edit(f.ua, newest, 'corrected');
    expect(await serviceRow('conversations', f.convA)).toMatchObject({ last_message_preview: 'corrected', last_message_at: new Date('2026-02-01T00:00:00Z') });
    await as(f.ua, (tx) => q(tx, sql`update messages set deleted_at = now() where id = ${newest}`));
    expect(await serviceRow('conversations', f.convA)).toMatchObject({ last_message_preview: 'x'.repeat(140) });
    await as(f.ua, (tx) => q(tx, sql`update messages set deleted_at = now() where id = ${older}`));
    expect(await serviceRow('conversations', f.convA)).toMatchObject({ last_message_preview: null });
    expect(await svc((tx) => q(tx, sql`select body from message_revisions where tenant_id = ${f.t1} and message_id = ${newest}`), f.t1)).toEqual([{ body: 'newest' }]);
  });
  for (const [column, value, rule] of [
    ['kind', sql`'internal'`, 'client_insert_eq'], ['subject', sql`'forged'`, 'client_insert_eq'], ['archived_at', sql`now()`, 'client_insert_eq'],
    ['last_message_at', sql`now()`, 'insert_eq'], ['last_message_preview', sql`'forged'`, 'insert_eq'],
    ['unread_for_client', sql`1`, 'insert_eq'], ['unread_for_coach', sql`1`, 'insert_eq'],
  ] as const) {
    it(`M11 conversations ua INSERT ${column} forged fresh client`, async () => {
      const f = await buildPrivateFixture(), client = await mkClient(f.t1), actor = await mkMembership({ ...f.ua, clientId: client });
      const id = randomUUID();
      await refuse(f, () => as(actor, (tx) => q(tx, sql`insert into conversations (id, tenant_id, client_id, ${sql.identifier(column)}) values (${id}, ${f.t1}, ${client}, ${value})`)), rule, column, '42501', 'conversations');
      await as(actor, (tx) => q(tx, sql`insert into conversations (id, tenant_id, client_id) values (${id}, ${f.t1}, ${client}) returning id`));
      expect(await serviceRow('conversations', id)).toMatchObject({ kind: 'client', client_id: client, subject: null, archived_at: null, last_message_at: null, last_message_preview: null, unread_for_coach: 0, unread_for_client: 0 });
    });
  }
  it('M11 conversations ua INSERT client_id foreign fresh thread RLS', async () => {
    const f = await buildPrivateFixture(), own = await mkClient(f.t1), foreign = await mkClient(f.t1), actor = await mkMembership({ ...f.ua, clientId: own }), id = randomUUID(), before = await snapshot(f);
    await expectRls(() => as(actor, (tx) => q(tx, sql`insert into conversations (id, tenant_id, client_id) values (${id}, ${f.t1}, ${foreign})`)));
    expect(await snapshot(f)).toEqual(before);
    await as(actor, (tx) => q(tx, sql`insert into conversations (id, tenant_id, client_id) values (${id}, ${f.t1}, ${own})`));
    expect(await serviceRow('conversations', id)).toMatchObject({ client_id: own });
  });
  for (const [column, value, rule, label] of [
    ['last_message_at', sql`now()`, 'immutable', 'time'], ['last_message_preview', sql`'spoof'`, 'immutable', 'preview'],
    ['unread_for_client', sql`99`, 'update_to', '99'], ['unread_for_client', sql`-1`, 'update_to', '-1'],
    ['unread_for_coach', sql`99`, 'update_to', '99'], ['unread_for_coach', sql`-1`, 'update_to', '-1'],
  ] as const) {
    it(`M12 conversations o1 UPDATE ${column} ${label} owner universal rule`, async () => {
      const f = await buildPrivateFixture(); await message(f);
      await refuse(f, () => as(f.o1, (tx) => q(tx, sql`update conversations set ${sql.identifier(column)} = ${value} where id = ${f.convA}`)), rule, column, '42501', 'conversations');
      await as(f.o1, (tx) => q(tx, sql`update conversations set unread_for_client = 0, unread_for_coach = 0, subject = 'allowed', archived_at = '2026-01-01T00:00:00Z' where id = ${f.convA}`));
      expect(await serviceRow('conversations', f.convA)).toMatchObject({ unread_for_client: 0, unread_for_coach: 0, subject: 'allowed', archived_at: new Date('2026-01-01T00:00:00Z') });
    });
  }
  for (const who of ['ua', 's1'] as const) {
    it(`M13 message_revisions ${who} UPDATE body/attachments live ${who === 's1' ? 'internal' : 'client'}`, async () => {
      const f = await buildPrivateFixture(), conversation = who === 's1' ? f.convInternal : f.convA, id = await message(f, f[who], conversation);
      await as(f[who], async (tx) => {
        await q(tx, sql`update messages set body = 'edited', attachments = '[{"kind":"file"}]'::jsonb where id = ${id}`);
        expect(await q(tx, sql`select tenant_id, client_id, message_id, body, attachments, revised_by, revised_at = now() as stamped from message_revisions where message_id = ${id}`))
          .toEqual([{ tenant_id: f.t1, client_id: who === 's1' ? null : f.clientA, message_id: id, body: 'original', attachments: [], revised_by: f[who].userId, stamped: true }]);
      });
      await as(f[who], (tx) => q(tx, sql`update messages set body = body, attachments = attachments where id = ${id}`));
      await mark(f[who], id);
      await as(f[who], (tx) => q(tx, sql`update messages set attachments = '[]'::jsonb where id = ${id}`));
      await as(f[who], (tx) => q(tx, sql`update messages set deleted_at = now() where id = ${id}`));
      const revisions = await svc((tx) => q(tx, sql`select body, attachments from message_revisions where tenant_id = ${f.t1} and message_id = ${id} order by revised_at, id`), f.t1);
      expect(revisions).toEqual([{ body: 'original', attachments: [] }, { body: 'edited', attachments: [{ kind: 'file' }] }]);
    });
  }
  for (const who of ['ua', 's1', 's2'] as const) {
    for (const operation of ['insert', 'update', 'delete'] as const) {
      it(`M14 message_revisions ${who} ${operation.toUpperCase()} append-only own/assigned/internal`, async () => {
        const f = await buildPrivateFixture(), a = await message(f), b = await message(f, f.ub, f.convB), internal = await message(f, f.s1, f.convInternal);
        await edit(f.ua, a); await edit(f.ub, b); await edit(f.s1, internal);
        const revisions = await svc((tx) => q<{ id: string; message_id: string }>(tx, sql`select id, message_id from message_revisions where tenant_id = ${f.t1}`), f.t1);
        const expectedMessages = who === 'ua' ? [a] : who === 's1' ? [a, internal] : [a, b, internal];
        const expectedIds = revisions.filter((row) => expectedMessages.includes(row.message_id)).map((row) => row.id).sort();
        expect(ids(await as(f[who], (tx) => q<{ id: string }>(tx, sql`select id from message_revisions`)))).toEqual(expectedIds);
        const before = await snapshot(f);
        const statement = operation === 'insert' ? sql`insert into message_revisions (tenant_id, message_id) values (${f.t1}, ${a})`
          : operation === 'update' ? sql`update message_revisions set body = 'spoof' where message_id = ${a}` : sql`delete from message_revisions where message_id = ${a}`;
        const error = await expectPrivilege(() => as(f[who], (tx) => q(tx, statement)));
        expect(error.message).toMatch(/permission denied for table message_revisions/);
        expect(await snapshot(f)).toEqual(before);
        expect(await as(f[who], (tx) => q(tx, sql`select body, attachments from message_revisions where message_id = ${a}`))).toEqual([{ body: 'original', attachments: [] }]);
      });
    }
  }
  it('M15 messages ua INSERT/UPDATE reply_to_id other-conversation/own live', async () => {
    const f = await buildPrivateFixture(), foreign = await message(f, f.ub, f.convB), own = await message(f), id = randomUUID(), before = await snapshot(f);
    const error = await expectCode(() => as(f.ua, (tx) => q(tx, insertMessage(f, id, f.convA, { reply_to_id: sql`${foreign}::uuid` }))), '23503');
    expect(error.constraint_name).toBe('messages_reply_fk'); expect(await snapshot(f)).toEqual(before);
    await as(f.ua, (tx) => q(tx, insertMessage(f, id, f.convA, { reply_to_id: sql`${own}::uuid` })));
    expect(await serviceRow('messages', id)).toMatchObject({ reply_to_id: own });
    await refuse(f, () => as(f.ua, (tx) => q(tx, sql`update messages set reply_to_id = null where id = ${id}`)), 'rule:app.message_rules', 'reply_to_id');
    await edit(f.ua, id);
  });
  for (const who of ['ua', 's1', 'o1'] as const) {
    for (const column of ['id', 'tenant_id', 'conversation_id', 'client_id', 'sender_user_id', 'sender_role', 'template_key', 'reply_to_id', 'client_uuid', 'created_at'] as const) {
      it(`M16 messages ${who} UPDATE ${column} authored/live`, async () => {
        const f = await buildPrivateFixture(), id = await message(f, f[who]), reply = await message(f, f[who]);
        const value = column === 'sender_role' ? sql`'client-forged'` : column === 'template_key' ? sql`'forged'` : column === 'created_at' ? sql`'2001-01-01'::timestamptz`
          : column === 'reply_to_id' ? sql`${reply}::uuid` : sql`${randomUUID()}::uuid`;
        await refuse(f, () => as(f[who], (tx) => q(tx, sql`update messages set ${sql.identifier(column)} = ${value} where id = ${id}`)), 'rule:app.message_rules', column);
        await edit(f[who], id);
        expect(await svc((tx) => q(tx, sql`select body, revised_by from message_revisions where tenant_id = ${f.t1} and message_id = ${id}`), f.t1)).toEqual([{ body: 'original', revised_by: f[who].userId }]);
      });
    }
    it(`M16 messages ${who} UPDATE edited_at without body change live`, async () => {
      const f = await buildPrivateFixture(), id = await message(f, f[who]), before = await snapshot(f);
      await as(f[who], (tx) => q(tx, sql`update messages set edited_at = '2099-01-01' where id = ${id}`));
      expect(await snapshot(f)).toEqual(before); await edit(f[who], id);
    });
  }
});
