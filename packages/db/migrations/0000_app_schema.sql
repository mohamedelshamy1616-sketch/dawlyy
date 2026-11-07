-- DAWLYY: roles, schema `app` and the security-definer helpers used by every RLS policy.
-- Runs FIRST (migration 0000, drizzle-kit custom migration `app_schema`): the generated CREATE POLICY
-- statements in migration 0001 call app.tenant_id(), app.is_staff() ... so these functions must already exist.
-- app.membership() and app.can_access_client() read public.memberships / public.staff_client_assignments,
-- which do not exist yet; `check_function_bodies = off` lets Postgres accept them now and resolve at call time.
-- Idempotent: safe to re-run.
set check_function_bodies = off;
--> statement-breakpoint

------------------------------------------------------------------------------
-- 1. Roles
------------------------------------------------------------------------------
-- `authenticated` exists on Supabase; locally it is created here.
-- `dawlyy_app` is the restricted runtime login (NOINHERIT, NOBYPASSRLS): it can only act after SET ROLE authenticated.
-- Its real password is NEVER set in a migration: run `alter role dawlyy_app password '<secret>'` afterwards
-- (tools/local_pg.ps1 -Action prepare locally; the Supabase SQL editor in production).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'dawlyy_app') then
    create role dawlyy_app login noinherit nobypassrls;
  end if;
end $$;
--> statement-breakpoint
grant authenticated to dawlyy_app;
--> statement-breakpoint
grant usage on schema public to authenticated;
--> statement-breakpoint

------------------------------------------------------------------------------
-- 2. Schema app + helpers
------------------------------------------------------------------------------
create schema if not exists app;
--> statement-breakpoint
grant usage on schema app to authenticated, dawlyy_app;
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

create or replace function app.tenant_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select tenant_id from app.membership() $$;
--> statement-breakpoint

create or replace function app.role() returns text
language sql stable security definer set search_path = ''
as $$ select role from app.membership() $$;
--> statement-breakpoint

create or replace function app.client_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select client_id from app.membership() $$;
--> statement-breakpoint

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select role in ('owner', 'staff') from app.membership()), false) $$;
--> statement-breakpoint

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
--> statement-breakpoint

revoke all on all functions in schema app from public;
--> statement-breakpoint
grant execute on all functions in schema app to authenticated, dawlyy_app;
