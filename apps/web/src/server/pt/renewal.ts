import 'server-only';
import { sql } from 'drizzle-orm';
import type { AuthContext, Tx } from '../db';
import { conflict, forbidden, notFound } from '../../api/errors';

export type RenewalRequest = { id: string; status: 'open' | 'handled'; delivered: number; balance: number; requested: string };
/** A client's package that is nearly used up, with the open request if one exists. */
export type RenewalDue = { subscription: string; name: { ar?: string; en?: string }; delivered: number; balance: number; request: string | null };
export type OpenRenewal = RenewalRequest & { client: string; name: string; subscription: string };

const asRequest = sql`id, status, delivered, balance, to_char(requested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as requested`;

export function myRenewalsDue(tx: Tx, auth: AuthContext) {
  if (auth.role !== 'client') throw forbidden();
  return tx.execute<RenewalDue>(sql`select s.id as subscription, s.package_snapshot->'name' as name,
    (count(*) filter (where e.kind='debit') - count(*) filter (where e.kind='correction'))::int as delivered,
    sum(e.delta)::int as balance,
    (select r.id from public.pt_renewal_requests r where r.subscription_id=s.id and r.status='open') as request
    from public.subscriptions s join public.pt_ledger_entries e on e.subscription_id=s.id
    where s.client_id=app.client_id() group by s.id, s.package_snapshot having sum(e.delta) <= 2 order by s.id`);
}

export function openRenewals(tx: Tx, auth: AuthContext, clientId?: string) {
  if (auth.role === 'client') throw forbidden();
  return tx.execute<OpenRenewal>(sql`select r.id, r.status, r.delivered, r.balance, r.client_id as client, r.subscription_id as subscription,
    to_char(r.requested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as requested,
    coalesce(c.display_name, concat_ws(' ', c.first_name, c.last_name)) as name
    from public.pt_renewal_requests r join public.clients c on c.id=r.client_id
    where r.status='open' ${clientId ? sql`and r.client_id=${clientId}` : sql``} order by r.requested_at, r.id`);
}

/** Returns the open request for the package, creating it only when none exists. */
export async function requestRenewal(tx: Tx, auth: AuthContext, subscription: string) {
  if (auth.role !== 'client') throw forbidden();
  const open = () => tx.execute<RenewalRequest>(sql`select ${asRequest} from public.pt_renewal_requests
    where subscription_id=${subscription} and status='open'`);
  const [existing] = await open();
  if (existing) return existing;
  const [owned] = await tx.execute(sql`select id from public.subscriptions where id=${subscription} and client_id=app.client_id()`);
  if (!owned) throw notFound();
  const [made] = await tx.execute<RenewalRequest>(sql`insert into public.pt_renewal_requests(tenant_id,client_id,subscription_id)
    select tenant_id,client_id,id from public.subscriptions where id=${subscription}
    on conflict (tenant_id,subscription_id) where status='open' do nothing returning ${asRequest}`);
  if (made) return made;
  const [raced] = await open();
  if (!raced) throw conflict();
  return raced;
}

/** Marks the request handled. The owner or assigned coach then records the package or payment by hand. */
export async function handleRenewal(tx: Tx, auth: AuthContext, id: string) {
  if (auth.role === 'client') throw forbidden();
  const [row] = await tx.execute(sql`update public.pt_renewal_requests set status='handled' where id=${id} and status='open' returning id`);
  if (row) return;
  const [seen] = await tx.execute(sql`select id from public.pt_renewal_requests where id=${id}`);
  throw seen ? conflict() : notFound();
}
