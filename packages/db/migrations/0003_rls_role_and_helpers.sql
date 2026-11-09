-- DAWLYY 0003: the RLS role and the identity helpers the new policies (0005) call.
-- See docs/architecture/02-database-security-model.md §3–§4. Idempotent.
-- 0000 switched body checking off; keep validation on. PL/pgSQL and dynamic-SQL names still need execution tests.
set check_function_bodies = on;
--> statement-breakpoint

-- New functions get no PUBLIC execute. This is the GLOBAL form (no IN SCHEMA): the schema-scoped form is a no-op
-- because PUBLIC's EXECUTE comes from the built-in global default. Runs as the migration role (postgres).
alter default privileges revoke execute on functions from public;
--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dawlyy_rls') then
    create role dawlyy_rls nologin noinherit nobypassrls;
  end if;
end $$;
--> statement-breakpoint
grant dawlyy_rls to dawlyy_app;
--> statement-breakpoint
grant usage on schema public, app to dawlyy_rls;
--> statement-breakpoint

-- The caller's membership: only the one pinned by withAuthTx (app.membership_id), only if it belongs to the
-- caller and is active. No pin, no tenant context.
create or replace function app.membership()
returns table (membership_id uuid, tenant_id uuid, role text, client_id uuid, permissions jsonb)
language sql stable security definer
set search_path = ''
as $$
  select m.id, m.tenant_id, m.role::text, m.client_id, m.permissions
  from public.memberships m
  where m.id = nullif(current_setting('app.membership_id', true), '')::uuid
    and m.user_id = app.uid()
    and m.status = 'active'
$$;
--> statement-breakpoint

create or replace function app.membership_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select membership_id from app.membership() $$;
--> statement-breakpoint

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'owner' from app.membership()), false) $$;
--> statement-breakpoint

create or replace function app.is_client() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'client' from app.membership()), false) $$;
--> statement-breakpoint

-- C3: does this client exist in the caller's tenant, and may the caller see it?
-- Owner: every client of the tenant. Staff: client_scope = all, or an assignment. Client: only their own record.
-- For single-value checks (app.audit, app.emit_event). Policies use app.sees_all_clients() and
-- app.assigned_client_ids() instead (PERF-01): never call this function with a row column.
create or replace function app.can_access_client(cid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select exists (select 1 from public.clients c where c.id = cid and c.tenant_id = m.tenant_id)
       and case m.role
             when 'owner' then true
             when 'client' then m.client_id = cid
             when 'staff' then
               coalesce(m.permissions ->> 'client_scope', 'assigned') = 'all'
               or exists (
                 select 1 from public.staff_client_assignments a
                 where a.membership_id = m.membership_id and a.client_id = cid)
             else false
           end
    from app.membership() m
  ), false)
$$;
--> statement-breakpoint

-- Owner, or staff with client_scope = all: every client of the tenant. Evaluated once per query (InitPlan).
create or replace function app.sees_all_clients() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select m.role = 'owner'
        or (m.role = 'staff' and coalesce(m.permissions ->> 'client_scope', 'assigned') = 'all')
    from app.membership() m
  ), false)
$$;
--> statement-breakpoint

-- PERF-01: the clients assigned to the pinned staff membership. Empty for owners, clients and unpinned callers.
-- `rows 100` tells the planner to expect a small set, so `c in (select app.assigned_client_ids())` becomes a
-- hashed SubPlan that is built once per query, not once per row.
create or replace function app.assigned_client_ids() returns setof uuid
language sql stable security definer set search_path = '' rows 100
as $$
  select a.client_id
  from app.membership() m
  join public.staff_client_assignments a
    on a.membership_id = m.membership_id and a.tenant_id = m.tenant_id
  where m.role = 'staff'
$$;
--> statement-breakpoint

-- May the caller see this user's tenant-scoped records (consents)? Owner: any member of the tenant.
-- Staff: team members, and client members of clients they can access. Client: only themself.
-- Single-value checks only; consents_staff uses app.accessible_user_ids() (PERF-02).
create or replace function app.can_access_user(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case m.role
      when 'owner' then exists (
        select 1 from public.memberships x where x.tenant_id = m.tenant_id and x.user_id = target)
      when 'staff' then exists (
        select 1 from public.memberships x
        where x.tenant_id = m.tenant_id and x.user_id = target
          and (x.role in ('owner', 'staff') or app.can_access_client(x.client_id)))
      else target = app.uid()
    end
    from app.membership() m
  ), false)
$$;
--> statement-breakpoint

-- PERF-02: the same answer as can_access_user, as a set. Hashed SubPlan, one evaluation per query.
create or replace function app.accessible_user_ids() returns setof uuid
language sql stable security definer set search_path = '' rows 600
as $$
  select x.user_id
  from app.membership() m
  join public.memberships x on x.tenant_id = m.tenant_id
  where case m.role
          when 'owner' then true
          when 'staff' then x.role in ('owner', 'staff')
                            or coalesce(m.permissions ->> 'client_scope', 'assigned') = 'all'
                            or x.client_id in (
                                 select a.client_id from public.staff_client_assignments a
                                 where a.membership_id = m.membership_id)
          else x.user_id = app.uid()
        end
$$;
--> statement-breakpoint

-- T20 / CV-01: module permissions of the pinned membership. Same rule as hasAction/isAllowed in
-- packages/core/src/authz/index.ts: owner passes; staff need the action or 'manage' in permissions.modules.<module>;
-- client, disabled, unpinned: false. Unknown module or action: false (the lists are MODULES and ACTIONS of core).
create or replace function app.has_perm(p_module text, p_action text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case m.role
      when 'owner' then true
      when 'staff' then coalesce(
        jsonb_typeof(m.permissions -> 'modules' -> p_module) = 'array'
        and ((m.permissions -> 'modules' -> p_module) @> '"manage"'::jsonb
             or (m.permissions -> 'modules' -> p_module) @> to_jsonb(p_action)),
        false)
      else false
    end
    from app.membership() m
  ), false)
  and p_module = any (array['dashboard', 'clients', 'packages', 'billing', 'programs', 'exercises', 'nutrition',
                            'foods', 'forms', 'checkins', 'assessments', 'calendar', 'tracking', 'messages',
                            'media', 'team', 'settings', 'reports', 'ai'])
  and p_action = any (array['view', 'create', 'edit', 'publish', 'delete', 'review', 'verify', 'export', 'manage'])
$$;
--> statement-breakpoint

-- Belt and braces on top of the global default: nothing here is executable by PUBLIC.
revoke all on function
  app.membership(), app.membership_id(), app.is_owner(), app.is_client(), app.can_access_client(uuid),
  app.sees_all_clients(), app.assigned_client_ids(), app.can_access_user(uuid), app.accessible_user_ids(),
  app.has_perm(text, text)
from public;
--> statement-breakpoint

grant execute on function
  app.uid(), app.membership(), app.membership_id(), app.tenant_id(), app.role(), app.client_id(),
  app.is_staff(), app.is_owner(), app.is_client(), app.sees_all_clients(), app.assigned_client_ids(),
  app.can_access_client(uuid), app.can_access_user(uuid), app.accessible_user_ids(), app.has_perm(text, text)
to dawlyy_rls;
--> statement-breakpoint
