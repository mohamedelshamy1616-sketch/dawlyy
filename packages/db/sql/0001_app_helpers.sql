-- DAWLYY — database helpers that drizzle-kit does not generate.
-- Applied as a custom migration (pnpm --filter @dawlyy/db exec drizzle-kit generate --custom --name app_helpers,
-- then paste this file into the generated SQL). Idempotent: safe to re-run.
--
-- 1. Restricted runtime role `dawlyy_app` (NOINHERIT) that can only act after SET ROLE authenticated.
-- 2. Schema `app` with security-definer helpers used by every RLS policy.
-- 3. Immutability trigger for published document versions (spec §29).
-- 4. Per-tenant client code generator (spec §10).
-- 5. Audit trigger helper (spec §33).

------------------------------------------------------------------------------
-- 1. Roles
------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Local Postgres (tests). Supabase already has this role.
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'dawlyy_app') then
    -- Password is replaced right after creation: alter role dawlyy_app password '<secret>';
    create role dawlyy_app login noinherit nobypassrls password 'change-me-now';
  end if;
end $$;

grant authenticated to dawlyy_app;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

------------------------------------------------------------------------------
-- 2. app.* helpers
------------------------------------------------------------------------------
create schema if not exists app;
grant usage on schema app to authenticated;

-- Caller's auth user id. Reads the Supabase JWT settings that withAuthTx() (and PostgREST) set.
create or replace function app.uid() returns uuid
language sql stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

-- The caller's active membership. withAuthTx() pins one with app.membership_id; otherwise the oldest active one.
create or replace function app.membership()
returns table (membership_id uuid, tenant_id uuid, role text, client_id uuid, permissions jsonb)
language sql stable security definer
set search_path = ''
as $$
  select m.id, m.tenant_id, m.role::text, m.client_id, m.permissions
  from public.memberships m
  where m.user_id = app.uid()
    and m.status = 'active'
    and (
      nullif(current_setting('app.membership_id', true), '') is null
      or m.id = current_setting('app.membership_id', true)::uuid
    )
  order by m.created_at
  limit 1
$$;

create or replace function app.tenant_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select tenant_id from app.membership() $$;

create or replace function app.role() returns text
language sql stable security definer set search_path = ''
as $$ select role from app.membership() $$;

create or replace function app.client_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select client_id from app.membership() $$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select role in ('owner', 'staff') from app.membership()), false) $$;

-- Owner: every client. Client: only themself. Staff: client_scope = all, or an explicit assignment.
create or replace function app.can_access_client(cid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case m.role
      when 'owner' then true
      when 'client' then m.client_id = cid
      when 'staff' then
        coalesce(m.permissions ->> 'client_scope', 'assigned') = 'all'
        or exists (
          select 1 from public.staff_client_assignments a
          where a.membership_id = m.membership_id and a.client_id = cid
        )
      else false
    end
    from app.membership() m
  ), false)
  and cid is not null
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated;
grant execute on all functions in schema app to dawlyy_app;

------------------------------------------------------------------------------
-- 3. Published versions are immutable (spec §29)
------------------------------------------------------------------------------
create or replace function app.protect_published_version() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('published', 'superseded') then
      raise exception 'published versions cannot be deleted (version %)', old.id using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status in ('published', 'superseded', 'archived') then
    -- Only the status transition published → superseded/archived (and its timestamps) may change.
    if new.document is distinct from old.document
       or new.version_no is distinct from old.version_no
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by then
      raise exception 'published versions are immutable (version %)', old.id using errcode = 'P0001';
    end if;
    if old.status = 'published' and new.status not in ('published', 'superseded', 'archived') then
      raise exception 'invalid transition from published to % (version %)', new.status, old.id using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['program_versions', 'nutrition_plan_versions', 'form_versions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_protect_published', t);
      execute format(
        'create trigger %I before update or delete on public.%I for each row execute function app.protect_published_version()',
        t || '_protect_published', t
      );
    end if;
  end loop;
end $$;

------------------------------------------------------------------------------
-- 4. Persistent client codes, e.g. DW-000123 (spec §10)
------------------------------------------------------------------------------
create or replace function app.next_client_code(tid uuid) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  n integer;
  prefix text;
begin
  update public.tenants
     set client_counter = client_counter + 1
   where id = tid
  returning client_counter, client_code_prefix into n, prefix;
  if n is null then
    raise exception 'unknown tenant %', tid;
  end if;
  return prefix || '-' || lpad(n::text, 6, '0');
end $$;

------------------------------------------------------------------------------
-- 5. Audit helper: row-level before/after snapshots for sensitive tables (spec §33)
------------------------------------------------------------------------------
create or replace function app.audit_row() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid;
  cid uuid;
begin
  tid := coalesce((to_jsonb(coalesce(new, old)) ->> 'tenant_id')::uuid, null);
  cid := case when to_jsonb(coalesce(new, old)) ? 'client_id' then (to_jsonb(coalesce(new, old)) ->> 'client_id')::uuid else null end;
  insert into public.audit_log (tenant_id, actor_user_id, actor_role, action, entity, entity_id, client_id, before, after, reason)
  values (
    tid,
    app.uid(),
    coalesce(app.role(), case when nullif(current_setting('app.service_reason', true), '') is not null then 'service' end),
    lower(tg_op),
    tg_table_name,
    (to_jsonb(coalesce(new, old)) ->> 'id'),
    cid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    nullif(current_setting('app.service_reason', true), '')
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['subscriptions', 'subscription_events', 'payments', 'client_entitlement_overrides', 'memberships', 'staff_client_assignments', 'business_settings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()',
        t || '_audit', t
      );
    end if;
  end loop;
end $$;
