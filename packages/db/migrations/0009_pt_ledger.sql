-- PT receipts are scoped to a subscription (one client's package purchase).
set check_function_bodies = on;
--> statement-breakpoint
create table public.pt_visits (
  tenant_id uuid not null constraint pt_visits_tenant_id_tenants_id_fk references public.tenants(id) on delete cascade,
  client_id uuid not null,
  subscription_id uuid not null,
  visit_id uuid not null,
  closed_at timestamptz not null default clock_timestamp(),
  closed_by uuid not null default app.uid(),
  primary key (tenant_id, visit_id),
  constraint pt_visit_scope_uq unique (tenant_id, client_id, subscription_id, visit_id),
  constraint pt_visit_sub_fk foreign key (tenant_id, client_id, subscription_id) references public.subscriptions(tenant_id, client_id, id) on delete cascade
);
--> statement-breakpoint
create table public.pt_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null constraint pt_ledger_entries_tenant_id_tenants_id_fk references public.tenants(id) on delete cascade,
  client_id uuid not null,
  subscription_id uuid not null,
  visit_id uuid,
  kind text not null,
  delta integer not null,
  position integer not null,
  reason text,
  approved_by uuid not null default app.uid(),
  created_at timestamptz not null default clock_timestamp(),
  constraint pt_entry_order_uq unique (subscription_id, position),
  constraint pt_visit_kind_uq unique (tenant_id, visit_id, kind),
  constraint pt_entry_sub_fk foreign key (tenant_id, client_id, subscription_id) references public.subscriptions(tenant_id, client_id, id) on delete cascade,
  constraint pt_entry_visit_fk foreign key (tenant_id, client_id, subscription_id, visit_id) references public.pt_visits(tenant_id, client_id, subscription_id, visit_id) on delete cascade,
  constraint pt_entry_shape check (
    (kind = 'debit' and delta = (0 - 1) and visit_id is not null and reason is null)
    or (reason is not null and length(btrim(reason)) >= 1 and length(btrim(reason)) <= 500 and (
      (kind = 'credit' and delta >= 0 and visit_id is null)
      or (kind = 'correction' and delta = 1 and visit_id is not null))))
);
--> statement-breakpoint
create unique index pt_open_once on public.pt_ledger_entries(subscription_id) where kind = 'credit';
--> statement-breakpoint
create table public.pt_receipt_actions (
  tenant_id uuid not null constraint pt_receipt_actions_tenant_id_tenants_id_fk references public.tenants(id) on delete cascade,
  client_id uuid not null,
  subscription_id uuid not null,
  visit_id uuid not null,
  kind text not null check (kind in ('view','confirm','dispute')),
  note text check (note is null or (length(note) <= 500 and kind <> 'view')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, visit_id, kind),
  constraint pt_action_visit_fk foreign key (tenant_id, client_id, subscription_id, visit_id) references public.pt_visits(tenant_id, client_id, subscription_id, visit_id) on delete cascade
);
--> statement-breakpoint
create unique index pt_one_decision on public.pt_receipt_actions(tenant_id,visit_id) where kind <> 'view';
--> statement-breakpoint
alter table public.pt_visits enable row level security;
--> statement-breakpoint
create policy pt_visits_tenant_guard on public.pt_visits as restrictive to dawlyy_rls using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
--> statement-breakpoint
create policy pt_visits_read_select on public.pt_visits for select to dawlyy_rls using ((select app.is_owner()) or client_id in (select app.assigned_client_ids()) or ((select app.is_client()) and client_id = (select app.client_id())));
--> statement-breakpoint
create policy pt_visits_write_insert on public.pt_visits for insert to dawlyy_rls with check ((select app.is_owner()) or client_id in (select app.assigned_client_ids()));
--> statement-breakpoint
revoke all on public.pt_visits from public, dawlyy_rls;
--> statement-breakpoint
grant select, insert (tenant_id, client_id, subscription_id, visit_id) on public.pt_visits to dawlyy_rls;
--> statement-breakpoint
alter table public.pt_ledger_entries enable row level security;
--> statement-breakpoint
create policy pt_ledger_entries_tenant_guard on public.pt_ledger_entries as restrictive to dawlyy_rls using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
--> statement-breakpoint
create policy pt_ledger_entries_read_select on public.pt_ledger_entries for select to dawlyy_rls using ((select app.is_owner()) or client_id in (select app.assigned_client_ids()) or ((select app.is_client()) and client_id = (select app.client_id())));
--> statement-breakpoint
create policy pt_ledger_entries_write_insert on public.pt_ledger_entries for insert to dawlyy_rls with check ((select app.is_owner()) or (kind = 'debit' and client_id in (select app.assigned_client_ids())));
--> statement-breakpoint
revoke all on public.pt_ledger_entries from public, dawlyy_rls;
--> statement-breakpoint
grant select, insert (tenant_id, client_id, subscription_id, visit_id, kind, delta, reason) on public.pt_ledger_entries to dawlyy_rls;
--> statement-breakpoint
alter table public.pt_receipt_actions enable row level security;
--> statement-breakpoint
create policy pt_receipt_actions_tenant_guard on public.pt_receipt_actions as restrictive to dawlyy_rls using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
--> statement-breakpoint
create policy pt_receipt_actions_read_select on public.pt_receipt_actions for select to dawlyy_rls using ((select app.is_owner()) or client_id in (select app.assigned_client_ids()) or ((select app.is_client()) and client_id = (select app.client_id())));
--> statement-breakpoint
create policy pt_receipt_actions_write_insert on public.pt_receipt_actions for insert to dawlyy_rls with check ((select app.is_client()) and client_id = (select app.client_id()));
--> statement-breakpoint
revoke all on public.pt_receipt_actions from public, dawlyy_rls;
--> statement-breakpoint
grant select, insert (tenant_id, client_id, subscription_id, visit_id, kind, note) on public.pt_receipt_actions to dawlyy_rls;
--> statement-breakpoint
-- All runtime inserts, including direct SQL, share the same balance and ordering guard.
create function app.pt_guard_entry() returns trigger language plpgsql set search_path = '' as $$
declare
  last_position integer;
  remaining bigint;
begin
  -- Let the INSERT policy reject inaccessible rows before inspecting their balance.
  if new.tenant_id is distinct from app.tenant_id() or (app.is_owner() or
      (new.kind = 'debit' and new.client_id in (select app.assigned_client_ids()))) is not true then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.subscription_id::text, 9));
  select coalesce(max(position), 0), coalesce(sum(delta), 0) into last_position, remaining
    from public.pt_ledger_entries where subscription_id = new.subscription_id;
  if (last_position = 0) <> (new.kind = 'credit') or remaining + new.delta < 0 then
    raise exception 'pt balance conflict' using errcode = 'P0001', detail = 'pt:balance';
  end if;
  if new.kind = 'correction' and not exists (select 1 from public.pt_receipt_actions
      where tenant_id = new.tenant_id and visit_id = new.visit_id and kind = 'dispute') then
    raise exception 'pt dispute required' using errcode = 'P0001', detail = 'pt:dispute';
  end if;
  new.position := last_position + 1;
  return new;
end $$;
--> statement-breakpoint
create trigger pt_guard_entry before insert on public.pt_ledger_entries for each row execute function app.pt_guard_entry();
--> statement-breakpoint
create function app.pt_close_visit() returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.pt_ledger_entries(tenant_id, client_id, subscription_id, visit_id, kind, delta)
    values(new.tenant_id, new.client_id, new.subscription_id, new.visit_id, 'debit', -1);
  return new;
end $$;
--> statement-breakpoint
create trigger pt_close_visit after insert on public.pt_visits for each row execute function app.pt_close_visit();
--> statement-breakpoint
revoke all on function app.pt_close_visit(), app.pt_guard_entry() from public;
--> statement-breakpoint
do $$
declare grantee text;
begin
  for grantee in select rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role') loop
    execute format('revoke all on public.pt_visits, public.pt_ledger_entries, public.pt_receipt_actions from %I', grantee);
    execute format('revoke all on function app.pt_close_visit(), app.pt_guard_entry() from %I', grantee);
  end loop;
end $$;
--> statement-breakpoint
