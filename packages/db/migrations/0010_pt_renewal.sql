-- A client asks to renew a PT package that is nearly used up. Payment stays manual.
set check_function_bodies = on;
--> statement-breakpoint
create table public.pt_renewal_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null constraint pt_renewal_requests_tenant_id_tenants_id_fk references public.tenants(id) on delete cascade,
  client_id uuid not null,
  subscription_id uuid not null,
  status text not null default 'open',
  delivered integer not null default 0,
  balance integer not null default 0,
  requested_at timestamptz not null default clock_timestamp(),
  handled_at timestamptz,
  handled_by uuid,
  constraint pt_renewal_sub_fk foreign key (tenant_id, client_id, subscription_id) references public.subscriptions(tenant_id, client_id, id) on delete cascade,
  constraint pt_renewal_state check (
    (status = 'open' and handled_at is null and handled_by is null)
    or (status = 'handled' and handled_at is not null and handled_by is not null)),
  constraint pt_renewal_counts check (delivered >= 0 and balance >= 0 and balance <= 2)
);
--> statement-breakpoint
create unique index pt_renewal_open_once on public.pt_renewal_requests(tenant_id, subscription_id) where status = 'open';
--> statement-breakpoint
alter table public.pt_renewal_requests enable row level security;
--> statement-breakpoint
create policy pt_renewal_requests_tenant_guard on public.pt_renewal_requests as restrictive to dawlyy_rls using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
--> statement-breakpoint
create policy pt_renewal_requests_read_select on public.pt_renewal_requests for select to dawlyy_rls using ((select app.is_owner()) or client_id in (select app.assigned_client_ids()) or ((select app.is_client()) and client_id = (select app.client_id())));
--> statement-breakpoint
create policy pt_renewal_requests_write_insert on public.pt_renewal_requests for insert to dawlyy_rls with check ((select app.is_client()) and client_id = (select app.client_id()));
--> statement-breakpoint
create policy pt_renewal_requests_write_update on public.pt_renewal_requests for update to dawlyy_rls using ((select app.is_owner()) or client_id in (select app.assigned_client_ids())) with check ((select app.is_owner()) or client_id in (select app.assigned_client_ids()));
--> statement-breakpoint
revoke all on public.pt_renewal_requests from public, dawlyy_rls;
--> statement-breakpoint
grant select, insert (tenant_id, client_id, subscription_id), update (status) on public.pt_renewal_requests to dawlyy_rls;
--> statement-breakpoint
-- The server, not the caller, measures the balance and the sessions delivered.
create function app.pt_renewal_guard() returns trigger language plpgsql set search_path = '' as $$
declare
  remaining bigint;
  funded bigint;
  done bigint;
begin
  -- Let the INSERT policy reject inaccessible rows before inspecting their balance.
  if new.tenant_id is distinct from app.tenant_id() or (app.is_client() and new.client_id = app.client_id()) is not true then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.tenant_id::text || ':' || new.subscription_id::text, 9));
  select count(*) filter (where kind = 'credit'), coalesce(sum(delta), 0),
      count(*) filter (where kind = 'debit') - count(*) filter (where kind = 'correction')
    into funded, remaining, done
    from public.pt_ledger_entries where subscription_id = new.subscription_id;
  if funded = 0 or remaining > 2 then
    raise exception 'pt renewal not due' using errcode = 'P0001', detail = 'pt:renewal';
  end if;
  new.status := 'open'; new.balance := remaining; new.delivered := done;
  new.handled_at := null; new.handled_by := null;
  return new;
end $$;
--> statement-breakpoint
create trigger pt_renewal_guard before insert on public.pt_renewal_requests for each row execute function app.pt_renewal_guard();
--> statement-breakpoint
create function app.pt_renewal_handle() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'open' or new.status <> 'handled' then
    raise exception 'pt renewal already handled' using errcode = 'P0001', detail = 'pt:renewal';
  end if;
  new.handled_at := pg_catalog.clock_timestamp();
  new.handled_by := app.uid();
  return new;
end $$;
--> statement-breakpoint
create trigger pt_renewal_handle before update on public.pt_renewal_requests for each row execute function app.pt_renewal_handle();
--> statement-breakpoint
revoke all on function app.pt_renewal_guard(), app.pt_renewal_handle() from public;
--> statement-breakpoint
do $$
declare grantee text;
begin
  for grantee in select rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role') loop
    execute format('revoke all on public.pt_renewal_requests from %I', grantee);
    execute format('revoke all on function app.pt_renewal_guard(), app.pt_renewal_handle() from %I', grantee);
  end loop;
end $$;
