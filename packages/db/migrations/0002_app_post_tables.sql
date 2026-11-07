-- DAWLYY: everything that needs the tables to exist. Runs LAST (migration 0002, drizzle-kit custom migration
-- `app_post_tables`), after migration 0001 has created the tables and policies.
-- 1. Table and sequence privileges for the `authenticated` role (RLS decides which rows).
-- 2. Published document versions are immutable (spec §29).
-- 3. Per-tenant client codes, e.g. DW-000123 (spec §10).
-- 4. Audit triggers (spec §33).
-- Idempotent: safe to re-run.

------------------------------------------------------------------------------
-- 1. Privileges
------------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
--> statement-breakpoint
grant usage, select on all sequences in schema public to authenticated;
--> statement-breakpoint
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
--> statement-breakpoint
alter default privileges in schema public grant usage, select on sequences to authenticated;
--> statement-breakpoint

------------------------------------------------------------------------------
-- 2. Published versions are immutable (spec §29)
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
--> statement-breakpoint

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
--> statement-breakpoint

------------------------------------------------------------------------------
-- 3. Persistent client codes (spec §10)
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
--> statement-breakpoint

------------------------------------------------------------------------------
-- 4. Audit: row-level before/after snapshots for sensitive tables (spec §33)
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
--> statement-breakpoint

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
--> statement-breakpoint

------------------------------------------------------------------------------
-- 5. Function privileges for the functions created above
------------------------------------------------------------------------------
revoke all on all functions in schema app from public;
--> statement-breakpoint
grant execute on all functions in schema app to authenticated, dawlyy_app;
