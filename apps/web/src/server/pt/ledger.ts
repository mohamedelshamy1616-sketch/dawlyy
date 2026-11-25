import 'server-only';
import { sql } from 'drizzle-orm';
import type { AuthContext, Tx } from '../db';
import { conflict, forbidden, notFound } from '../../api/errors';

export type PtPackage = { id: string; name: { ar?: string; en?: string }; balance: number | null; starts: string };
export type PtReceipt = { visit: string; date: string; session: number; balance: number };
export type ClientReceipt = PtReceipt & { decision: 'confirm' | 'dispute' | null; viewed: boolean; corrected: boolean };
export type PtDispute = PtReceipt & { name: string; note: string | null };

export function clientPackages(tx: Tx, clientId: string) {
  return tx.execute<PtPackage>(sql`select s.id, s.package_snapshot->'name' as name, s.starts_on::text as starts,
    (select sum(e.delta)::int from public.pt_ledger_entries e where e.subscription_id=s.id) as balance
    from public.subscriptions s where s.client_id=${clientId} and
    (app.is_owner() or s.client_id in (select app.assigned_client_ids())) order by s.starts_on desc, s.id`);
}

// Prefix sums preserve the original receipt even if another visit or correction is posted.
function history(subscription?: string) {
  return sql`with history as (
  select e.visit_id, e.kind, to_char(v.closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as date,
    (sum(e.delta) over w)::int as balance,
    (count(*) filter (where e.kind='debit') over w)::int as session
  from public.pt_ledger_entries e left join public.pt_visits v using (tenant_id, visit_id)
  ${subscription ? sql`where e.subscription_id=${subscription}` : sql``}
  window w as (partition by e.subscription_id order by e.position rows unbounded preceding)
)`;
}

export function myReceipts(tx: Tx, auth: AuthContext) {
  if (auth.role !== 'client') throw forbidden();
  return tx.execute<ClientReceipt>(sql`${history()}
    select h.visit_id as visit,h.date,h.balance,h.session,a.kind as decision,
      exists(select 1 from public.pt_receipt_actions where visit_id=h.visit_id and kind='view') as viewed,
      exists(select 1 from public.pt_ledger_entries where visit_id=h.visit_id and kind='correction') as corrected
    from history h left join public.pt_receipt_actions a on a.visit_id=h.visit_id and a.kind<>'view'
    where h.kind='debit' order by h.date::timestamptz desc, h.visit_id`);
}

export function disputes(tx: Tx, auth: AuthContext) {
  if (auth.role !== 'owner') throw forbidden();
  return tx.execute<PtDispute>(sql`${history()} select h.visit_id as visit,h.date,h.balance,h.session,a.note,
    coalesce(c.display_name, concat_ws(' ', c.first_name,c.last_name)) as name
    from history h join public.pt_receipt_actions a on a.visit_id=h.visit_id and a.kind='dispute'
    join public.clients c on c.id=a.client_id where h.kind='debit' and not exists
    (select 1 from public.pt_ledger_entries where visit_id=h.visit_id and kind='correction')
    order by a.created_at,h.visit_id`);
}

export async function openPackage(tx: Tx, auth: AuthContext, subscription: string, count: number, reason: string) {
  if (auth.role !== 'owner') throw forbidden();
  const [row] = await tx.execute(sql`insert into public.pt_ledger_entries(tenant_id,client_id,subscription_id,kind,delta,reason)
    select tenant_id,client_id,id,'credit',${count},${reason} from public.subscriptions where id=${subscription}
    returning id`);
  if (!row) throw notFound();
}

export async function closeVisit(tx: Tx, auth: AuthContext, subscription: string, visit: string) {
  if (auth.role === 'client') throw forbidden();
  await tx.execute(sql`insert into public.pt_visits(tenant_id,client_id,subscription_id,visit_id)
    select tenant_id,client_id,id,${visit} from public.subscriptions where id=${subscription}
    and (app.is_owner() or client_id in (select app.assigned_client_ids()))
    on conflict (tenant_id,visit_id) do nothing`);
  const [receipt] = await tx.execute<PtReceipt>(sql`${history(subscription)} select h.visit_id as visit,h.date,h.balance,h.session
    from history h where h.kind='debit' and h.visit_id=${visit}`);
  if (!receipt) throw notFound();
  return receipt;
}

export async function respond(tx: Tx, auth: AuthContext, visit: string, kind: 'view' | 'confirm' | 'dispute', note?: string) {
  if (auth.role !== 'client') throw forbidden();
  const [row] = await tx.execute(sql`select visit_id from public.pt_visits where visit_id=${visit}`);
  if (!row) throw notFound();
  await tx.execute(sql`insert into public.pt_receipt_actions(tenant_id,client_id,subscription_id,visit_id,kind,note)
    select tenant_id,client_id,subscription_id,visit_id,${kind},${note ?? null} from public.pt_visits where visit_id=${visit}
    on conflict (tenant_id,visit_id,kind) do nothing`);
}

export async function correct(tx: Tx, auth: AuthContext, visit: string, reason: string) {
  if (auth.role !== 'owner') throw forbidden();
  const [row] = await tx.execute(sql`insert into public.pt_ledger_entries(tenant_id,client_id,subscription_id,visit_id,kind,delta,reason)
    select tenant_id,client_id,subscription_id,visit_id,'correction',1,${reason} from public.pt_visits where visit_id=${visit}
    returning id`);
  if (!row) throw notFound();
}

export function ledgerError(error: unknown): never {
  let cause = error;
  while (cause && typeof cause === 'object') {
    const pg = cause as { code?: string; detail?: string; cause?: unknown };
    if (pg.code === '42501') throw forbidden();
    if (pg.code === '23505' || (pg.code === 'P0001' && pg.detail?.startsWith('pt:'))) throw conflict();
    cause = pg.cause;
  }
  throw error;
}
