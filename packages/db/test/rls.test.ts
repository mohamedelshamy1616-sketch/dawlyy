import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, withAuthTx, withServiceTx, withUserTx } from '../src/client';
import { buildFixture, pgCode, rows, truncateAll, type Fixture } from './fixtures';

/** Real-database test of row-level security. Needs the local cluster (tools/local_pg.ps1) and `pnpm migrate`. */

let fx: Fixture;

const count = async (tx: Parameters<Parameters<typeof withAuthTx>[1]>[0], query: ReturnType<typeof sql>) =>
  rows<{ n: number }>(await tx.execute(query))[0]!.n;

beforeAll(async () => {
  fx = await buildFixture();
});

afterAll(async () => {
  try {
    await truncateAll();
  } finally {
    await closeDb();
  }
});

describe('row level security', () => {
  it('R1 runtime guard: authenticated role, no RLS bypass, connection is not the table owner', async () => {
    const info = await withAuthTx(fx.ua, async (tx) =>
      rows<{ cur: string; sess: string; bypass: boolean; owner: string }>(
        await tx.execute(sql`select current_user::text as cur, session_user::text as sess,
          (select rolbypassrls from pg_roles where rolname = current_user) as bypass,
          (select tableowner from pg_tables where schemaname = 'public' and tablename = 'clients')::text as owner`),
      )[0]!,
    );
    // doc §3.1 runtime role: transactions SET LOCAL ROLE dawlyy_rls (NOLOGIN, no BYPASSRLS); `authenticated` is never reachable.
    expect(info.cur).toBe('dawlyy_rls');
    expect(info.bypass).toBe(false);
    expect(info.sess).toBe('dawlyy_app');
    expect(info.owner).not.toBe('dawlyy_app');
  });

  it('R2 client A reads only A: own client row, none of B subscriptions or metric entries', async () => {
    await withAuthTx(fx.ua, async (tx) => {
      const clients = rows<{ id: string }>(await tx.execute(sql`select id from clients`));
      expect(clients.map((c) => c.id)).toEqual([fx.clientA]);
      expect(await count(tx, sql`select count(*)::int as n from subscriptions where client_id = ${fx.clientA}`)).toBe(1);
      expect(await count(tx, sql`select count(*)::int as n from subscriptions where client_id = ${fx.clientB}`)).toBe(0);
      expect(await count(tx, sql`select count(*)::int as n from metric_entries where client_id = ${fx.clientA}`)).toBeGreaterThanOrEqual(1);
      expect(await count(tx, sql`select count(*)::int as n from metric_entries where client_id = ${fx.clientB}`)).toBe(0);
    });
  });

  it('R3 client B cannot read A rows', async () => {
    await withAuthTx(fx.ub, async (tx) => {
      expect(await count(tx, sql`select count(*)::int as n from clients where id = ${fx.clientA}`)).toBe(0);
      expect(await count(tx, sql`select count(*)::int as n from subscriptions where client_id = ${fx.clientA}`)).toBe(0);
      expect(await count(tx, sql`select count(*)::int as n from metric_entries where client_id = ${fx.clientA}`)).toBe(0);
      expect(await count(tx, sql`select count(*)::int as n from programs where id = ${fx.copyProgram}`)).toBe(0);
      expect(await count(tx, sql`select count(*)::int as n from programs where client_id = ${fx.clientA}`)).toBe(0);
    });
  });

  it('R4 client A cannot read client_notes about A', async () => {
    await withAuthTx(fx.ua, async (tx) => {
      expect(await count(tx, sql`select count(*)::int as n from client_notes`)).toBe(0);
    });
    // Positive control: the owner does see the note.
    await withAuthTx(fx.o1, async (tx) => {
      expect(await count(tx, sql`select count(*)::int as n from client_notes where id = ${fx.noteA}`)).toBe(1);
    });
  });

  it('R5 staff assigned to A reads A and not B; assignment and revocation take effect', async () => {
    await withAuthTx(fx.s1, async (tx) => {
      expect(await count(tx, sql`select count(*)::int as n from clients where id = ${fx.clientA}`)).toBe(1);
      expect(await count(tx, sql`select count(*)::int as n from subscriptions where client_id = ${fx.clientA}`)).toBe(1);
      expect(await count(tx, sql`select count(*)::int as n from clients where id = ${fx.clientB}`)).toBe(0);
      expect(await count(tx, sql`select count(*)::int as n from subscriptions where client_id = ${fx.clientB}`)).toBe(0);
      expect(await count(tx, sql`select count(*)::int as n from metric_entries where client_id = ${fx.clientB}`)).toBe(0);
    });

    await withServiceTx(fx.t1, 'rls test: assign S1 to B', (tx) =>
      tx.execute(sql`insert into staff_client_assignments (tenant_id, membership_id, client_id)
        values (${fx.t1}, ${fx.s1MembershipId}, ${fx.clientB})`),
    );
    await withAuthTx(fx.s1, async (tx) => {
      expect(await count(tx, sql`select count(*)::int as n from clients where id = ${fx.clientB}`)).toBe(1);
      expect(await count(tx, sql`select count(*)::int as n from subscriptions where client_id = ${fx.clientB}`)).toBe(1);
    });

    await withServiceTx(fx.t1, 'rls test: revoke S1 from B', (tx) =>
      tx.execute(sql`delete from staff_client_assignments where tenant_id = ${fx.t1}
        and membership_id = ${fx.s1MembershipId} and client_id = ${fx.clientB}`),
    );
    await withAuthTx(fx.s1, async (tx) => {
      expect(await count(tx, sql`select count(*)::int as n from clients where id = ${fx.clientB}`)).toBe(0);
      expect(await count(tx, sql`select count(*)::int as n from subscriptions where client_id = ${fx.clientB}`)).toBe(0);
    });
  });

  it('R6 owner reads A and B and nothing of tenant T2', async () => {
    await withAuthTx(fx.o1, async (tx) => {
      expect(await count(tx, sql`select count(*)::int as n from clients where id in (${fx.clientA}, ${fx.clientB})`)).toBe(2);
      expect(await count(tx, sql`select count(*)::int as n from clients where tenant_id = ${fx.t2}`)).toBe(0);
      expect(await count(tx, sql`select count(*)::int as n from packages where tenant_id = ${fx.t2}`)).toBe(0);
      expect(await count(tx, sql`select count(*)::int as n from subscriptions where tenant_id = ${fx.t2}`)).toBe(0);
    });
  });

  it('R7 client A inserts its own metric entry, not one for B', async () => {
    const insertFor = (tx: Parameters<Parameters<typeof withAuthTx>[1]>[0], clientId: string) =>
      tx.execute(sql`insert into metric_entries (tenant_id, client_id, metric, value, unit, recorded_at, local_date, timezone, client_uuid)
        values (${fx.t1}, ${clientId}, 'weight', 79.5, 'kg', now(), current_date, 'Africa/Cairo', ${randomUUID()})`);

    await withAuthTx(fx.ua, (tx) => insertFor(tx, fx.clientA));

    const bBefore = await withServiceTx(fx.t1, 'rls test: count B', async (tx) =>
      count(tx, sql`select count(*)::int as n from metric_entries where tenant_id = ${fx.t1} and client_id = ${fx.clientB}`),
    );
    let code: string | undefined;
    try {
      await withAuthTx(fx.ua, (tx) => insertFor(tx, fx.clientB));
    } catch (error) {
      code = pgCode(error);
    }
    expect(code).toBe('42501');

    const after = await withServiceTx(fx.t1, 'rls test: recount', async (tx) => ({
      a: await count(tx, sql`select count(*)::int as n from metric_entries where tenant_id = ${fx.t1} and client_id = ${fx.clientA}`),
      b: await count(tx, sql`select count(*)::int as n from metric_entries where tenant_id = ${fx.t1} and client_id = ${fx.clientB}`),
    }));
    expect(after.a).toBe(2);
    expect(after.b).toBe(bBefore);
  });

  it('R8 template program is visible to owner and staff, not to clients; the copy only to A', async () => {
    const seesTemplate = (ctx: Fixture['o1']) =>
      withAuthTx(ctx, (tx) => count(tx, sql`select count(*)::int as n from programs where id = ${fx.templateProgram}`));
    expect(await seesTemplate(fx.o1)).toBe(1);
    expect(await seesTemplate(fx.s1)).toBe(1);
    expect(await seesTemplate(fx.ua)).toBe(0);
    expect(await seesTemplate(fx.ub)).toBe(0);

    const seesCopy = (ctx: Fixture['o1']) =>
      withAuthTx(ctx, (tx) => count(tx, sql`select count(*)::int as n from programs where id = ${fx.copyProgram}`));
    expect(await seesCopy(fx.ua)).toBe(1);
    expect(await seesCopy(fx.ub)).toBe(0);
  });

  it('R9 withUserTx returns exactly the caller membership', async () => {
    const mine = await withUserTx(fx.ua.userId, async (tx) =>
      rows<{ id: string; user_id: string }>(await tx.execute(sql`select id, user_id from memberships`)),
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]!.user_id).toBe(fx.ua.userId);
    expect(mine[0]!.id).toBe(fx.ua.membershipId);
  });

  it('R10 a published program version is immutable; only the status may move to superseded', async () => {
    let code: string | undefined;
    try {
      await withServiceTx(fx.t1, 'rls test: edit published document', (tx) =>
        tx.execute(sql`update program_versions set document = ${JSON.stringify({ weeks: ['changed'] })}::jsonb where id = ${fx.publishedVersion}`),
      );
    } catch (error) {
      code = pgCode(error);
    }
    expect(code).toBe('P0001');

    await withServiceTx(fx.t1, 'rls test: supersede', (tx) =>
      tx.execute(sql`update program_versions set status = 'superseded', superseded_at = now() where id = ${fx.publishedVersion}`),
    );
    const status = await withServiceTx(fx.t1, 'rls test: read status', async (tx) =>
      rows<{ status: string }>(await tx.execute(sql`select status::text as status from program_versions where id = ${fx.publishedVersion}`))[0]!.status,
    );
    expect(status).toBe('superseded');
  });

  it('R11 app.next_client_code counts per tenant: DW-000001 then DW-000002', async () => {
    const t3 = randomUUID();
    const codes = await withServiceTx(t3, 'rls test: client codes', async (tx) => {
      await tx.execute(sql`insert into tenants (id, name, slug) values (${t3}, 'Tenant Three', ${'rls-t3-' + t3.slice(0, 8)})`);
      const first = rows<{ code: string }>(await tx.execute(sql`select app.next_client_code(${t3}::uuid) as code`))[0]!.code;
      const second = rows<{ code: string }>(await tx.execute(sql`select app.next_client_code(${t3}::uuid) as code`))[0]!.code;
      return [first, second];
    });
    expect(codes).toEqual(['DW-000001', 'DW-000002']);
  });

  it('R12 service transaction filtered by tenant T2 returns only T2 rows', async () => {
    const found = await withServiceTx(fx.t2, 'rls test: tenant filter', async (tx) => ({
      clients: rows<{ id: string; tenant_id: string }>(await tx.execute(sql`select id, tenant_id from clients where tenant_id = ${fx.t2}`)),
      packages: rows<{ tenant_id: string }>(await tx.execute(sql`select tenant_id from packages where tenant_id = ${fx.t2}`)),
    }));
    // doc §13.2 baseline: tenant T2 owns clientC and clientD (the disabled-membership client); T1 rows must be absent.
    expect(found.clients.map((c) => c.id).sort()).toEqual([fx.clientC, fx.clientD].sort());
    expect(found.clients.every((c) => c.tenant_id === fx.t2)).toBe(true);
    expect(found.packages).toHaveLength(1);
  });
});
