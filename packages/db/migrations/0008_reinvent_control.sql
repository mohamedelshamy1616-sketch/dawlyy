-- reinvent R0a: history-preserving controls and private weekly review data.
set check_function_bodies = on;
--> statement-breakpoint
alter default privileges revoke execute on functions from public;
--> statement-breakpoint

-- A. Archive attribution. Client status remains the service's responsibility.
alter table public.clients add column archived_by uuid;
--> statement-breakpoint
alter table public.programs add column archived_by uuid;
--> statement-breakpoint
alter table public.nutrition_plans add column archived_by uuid;
--> statement-breakpoint
alter table public.forms add column archived_by uuid;
--> statement-breakpoint
alter table public.packages add column archived_by uuid;
--> statement-breakpoint
alter table public.exercises add column archived_at timestamptz, add column archived_by uuid;
--> statement-breakpoint
create function app.guard_archive() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'dawlyy_rls' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.archived_at is not null or new.archived_by is not null then
      raise exception '%: archive columns must start null', tg_table_name
        using errcode = '42501', detail = 'guard:archive', table = tg_table_name,
          column = case when new.archived_at is not null then 'archived_at' else 'archived_by' end;
    end if;
    return new;
  end if;
  if new.archived_by is distinct from old.archived_by then
    raise exception '%: archived_by is stamped by the database', tg_table_name
      using errcode = '42501', detail = 'guard:archive', table = tg_table_name, column = 'archived_by';
  end if;
  if new.archived_at is distinct from old.archived_at then
    if not app.is_staff() or not app.has_perm(tg_argv[0], 'edit') then
      raise exception '%: archive and restore require the module edit permission', tg_table_name
        using errcode = '42501', detail = 'guard:archive', table = tg_table_name, column = 'archived_at';
    end if;
    if tg_table_name = 'exercises' and new.tenant_id is null then
      raise exception 'system exercises use tenant_hidden_items'
        using errcode = 'P0001', detail = 'guard:archive', table = tg_table_name, column = 'archived_at';
    end if;
    if old.archived_at is not null and new.archived_at is not null then
      raise exception '%: clear archived_at before archiving again', tg_table_name
        using errcode = 'P0001', detail = 'guard:archive', table = tg_table_name, column = 'archived_at';
    end if;
    new.archived_by := case when new.archived_at is null then null else app.uid() end;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.guard_archive() from public;
--> statement-breakpoint
create trigger clients_55_archive before insert or update on public.clients
  for each row execute function app.guard_archive('clients');
--> statement-breakpoint
create trigger programs_55_archive before insert or update on public.programs
  for each row execute function app.guard_archive('programs');
--> statement-breakpoint
create trigger nutrition_plans_55_archive before insert or update on public.nutrition_plans
  for each row execute function app.guard_archive('nutrition');
--> statement-breakpoint
create trigger forms_55_archive before insert or update on public.forms
  for each row execute function app.guard_archive('forms');
--> statement-breakpoint
create trigger packages_55_archive before insert or update on public.packages
  for each row execute function app.guard_archive('packages');
--> statement-breakpoint
create trigger exercises_55_archive before insert or update on public.exercises
  for each row execute function app.guard_archive('exercises');
--> statement-breakpoint
create trigger exercises_audit after update of archived_at on public.exercises
  for each row when (new.tenant_id is not null) execute function app.audit_row();
--> statement-breakpoint

-- B. Cancellation attribution; the 0006 JSON has only the cancelled_by additions.
alter table public.calendar_events add column cancelled_by uuid;
--> statement-breakpoint
drop trigger if exists calendar_events_50_guard on public.calendar_events;
--> statement-breakpoint
create trigger calendar_events_50_guard before insert or update or delete on public.calendar_events for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"completed_at":null,"skipped_at":null,"cancelled_at":null,"cancelled_by":null,"source":"manual","rule_key":null},"immutable":["id","tenant_id","client_id","subscription_id","source","rule_key","created_by","created_at","completed_at","skipped_at","cancelled_at","cancelled_by"],"stamp_update":{"updated_at":"now"},"client_update":["state"],"client_transitions":{"column":"state","edges":[["scheduled","completed"],["due","completed"],["overdue","completed"],["scheduled","skipped"],["due","skipped"],["overdue","skipped"]]},"on_transition":{"column":"state","stamps":{"scheduled":{"completed_at":"null","skipped_at":"null","cancelled_at":"null","cancelled_by":"null"},"due":{"completed_at":"null","skipped_at":"null","cancelled_at":"null","cancelled_by":"null"},"overdue":{"completed_at":"null","skipped_at":"null","cancelled_at":"null","cancelled_by":"null"},"rescheduled":{"completed_at":"null","skipped_at":"null","cancelled_at":"null","cancelled_by":"null"},"completed":{"completed_at":"now","skipped_at":"null","cancelled_at":"null","cancelled_by":"null"},"skipped":{"skipped_at":"now","completed_at":"null","cancelled_at":"null","cancelled_by":"null"},"cancelled":{"cancelled_at":"now","completed_at":"null","skipped_at":"null","cancelled_by":"uid"}}}}');
--> statement-breakpoint
create trigger calendar_events_audit after update of state on public.calendar_events
  for each row execute function app.audit_row();
--> statement-breakpoint
alter table public.meal_logs add column voided_at timestamptz, add column voided_by uuid,
  add column void_reason text, add column replaces_id uuid,
  add constraint meal_logs_void_reason_ck check (length(void_reason) <= 500);
--> statement-breakpoint
alter table public.metric_entries add column voided_at timestamptz, add column voided_by uuid,
  add column void_reason text,
  add constraint metric_entries_void_reason_ck check (length(void_reason) <= 500);
--> statement-breakpoint
alter table public.measurement_sets add column voided_at timestamptz, add column voided_by uuid,
  add column void_reason text, add column replaces_id uuid,
  add constraint measurement_sets_void_reason_ck check (length(void_reason) <= 500);
--> statement-breakpoint
alter table public.workout_sessions add column voided_at timestamptz, add column voided_by uuid,
  add column void_reason text,
  add constraint workout_sessions_void_reason_ck check (length(void_reason) <= 500);
--> statement-breakpoint
create unique index meal_logs_tenant_client_id_uq on public.meal_logs (tenant_id, client_id, id);
--> statement-breakpoint
create unique index measurement_sets_tenant_client_id_uq on public.measurement_sets (tenant_id, client_id, id);
--> statement-breakpoint
alter table public.meal_logs add constraint meal_logs_replaces_fk
  foreign key (tenant_id, client_id, replaces_id) references public.meal_logs (tenant_id, client_id, id) on delete no action;
--> statement-breakpoint
alter table public.measurement_sets add constraint measurement_sets_replaces_fk
  foreign key (tenant_id, client_id, replaces_id) references public.measurement_sets (tenant_id, client_id, id) on delete no action;
--> statement-breakpoint
-- Leading columns also index each composite foreign key's child side.
create unique index meal_logs_replaces_uq on public.meal_logs (tenant_id, client_id, replaces_id) where replaces_id is not null;
--> statement-breakpoint
create unique index measurement_sets_replaces_uq on public.measurement_sets (tenant_id, client_id, replaces_id) where replaces_id is not null;
--> statement-breakpoint
-- R0a: ordinary client sync may INSERT facts, never UPDATE an existing fact.
-- Keep the immutable and monotonic rules; void_entry still owns void attribution.
drop trigger meal_logs_50_guard on public.meal_logs;
--> statement-breakpoint
create trigger meal_logs_50_guard before insert or update or delete on public.meal_logs for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","client_uuid","created_at"],"monotonic":["client_updated_at"],"client_update":[]}');
--> statement-breakpoint
drop trigger measurement_sets_50_guard on public.measurement_sets;
--> statement-breakpoint
create trigger measurement_sets_50_guard before insert or update or delete on public.measurement_sets for each row execute function app.guard_row('{"client_insert_eq":{"taken_by":"client"},"immutable":["id","tenant_id","client_id","client_uuid","taken_by","created_at"],"monotonic":["client_updated_at"],"client_update":[]}');
--> statement-breakpoint
drop trigger supplement_logs_50_guard on public.supplement_logs;
--> statement-breakpoint
create trigger supplement_logs_50_guard before insert or update or delete on public.supplement_logs for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","client_uuid"],"monotonic":["client_updated_at"],"client_update":[]}');
--> statement-breakpoint
create function app.guard_void() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
begin
  if current_user <> 'dawlyy_rls' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op <> 'INSERT' and old.voided_at is not null then
    raise exception '%: a voided row cannot be updated or deleted', tg_table_name
      using errcode = 'P0001', detail = 'guard:void', table = tg_table_name, column = 'voided_at';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  foreach col in array array['voided_at', 'voided_by', 'void_reason'] loop
    if (tg_op = 'INSERT' and pg_catalog.to_jsonb(new) -> col <> 'null'::jsonb)
       or (tg_op = 'UPDATE' and (pg_catalog.to_jsonb(new) -> col) is distinct from (pg_catalog.to_jsonb(old) -> col)) then
      raise exception '%: % can only be written by void_entry or a correction', tg_table_name, col
        using errcode = '42501', detail = 'guard:void', table = tg_table_name, column = col;
    end if;
  end loop;
  -- A correction is an INSERT. Retargeting its pointer on UPDATE would rewrite history.
  if tg_op = 'UPDATE' and (pg_catalog.to_jsonb(new) -> 'replaces_id') is distinct from (pg_catalog.to_jsonb(old) -> 'replaces_id') then
    raise exception '%: replaces_id cannot be changed', tg_table_name
      using errcode = '42501', detail = 'guard:void', table = tg_table_name, column = 'replaces_id';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.guard_void() from public;
--> statement-breakpoint
create trigger meal_logs_45_void before insert or update or delete on public.meal_logs
  for each row execute function app.guard_void();
--> statement-breakpoint
create trigger metric_entries_45_void before insert or update or delete on public.metric_entries
  for each row execute function app.guard_void();
--> statement-breakpoint
create trigger measurement_sets_45_void before insert or update or delete on public.measurement_sets
  for each row execute function app.guard_void();
--> statement-breakpoint
create trigger workout_sessions_45_void before insert or update or delete on public.workout_sessions
  for each row execute function app.guard_void();
--> statement-breakpoint
-- The SHARE lock conflicts with void_entry's UPDATE lock and lasts until commit.
-- UPDATE checks OLD: an attempted session reassignment must not escape a voided parent.
create function app.set_logs_parent_live() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target public.set_logs%rowtype;
  parent_voided_at timestamptz;
begin
  if current_user <> 'dawlyy_rls' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then target := new; else target := old; end if;
  select s.voided_at into parent_voided_at
    from public.workout_sessions s
    where s.tenant_id = target.tenant_id and s.client_id = target.client_id and s.id = target.session_id
    for share;
  if parent_voided_at is not null then
    raise exception 'a voided workout session cannot accept set writes'
      using errcode = 'P0001', detail = 'rule:app.set_logs_parent_live', table = 'set_logs', column = 'session_id';
  end if;
  -- Missing/inaccessible parents remain subject to RLS and the composite session FK.
  return case when tg_op = 'DELETE' then old else new end;
end $$;
--> statement-breakpoint
revoke all on function app.set_logs_parent_live() from public;
--> statement-breakpoint
create trigger set_logs_45_parent_live before insert or update or delete on public.set_logs
  for each row execute function app.set_logs_parent_live();
--> statement-breakpoint
create function app.void_entry(p_table text, p_id uuid, p_reason text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  entry record;
  permission_module text;
begin
  if p_table is null or p_table not in ('meal_logs', 'metric_entries', 'measurement_sets', 'workout_sessions') then
    raise exception 'unsupported entry table'
      using errcode = '22023', detail = 'rule:app.void_entry';
  end if;
  if tid is null or app.uid() is null then
    raise exception 'no tenant context' using errcode = '42501', detail = 'rule:app.void_entry';
  end if;
  execute pg_catalog.format('select client_id, created_at, voided_at from public.%I where tenant_id = $1 and id = $2 for update', p_table)
    into entry using tid, p_id;
  -- Dynamic EXECUTE does not set FOUND. A missing row has no client_id.
  if entry.client_id is null then
    raise exception 'entry is not accessible' using errcode = '42501', detail = 'rule:app.void_entry';
  end if;
  permission_module := case when p_table = 'meal_logs' then 'nutrition' else 'tracking' end;
  if not coalesce(
    (app.is_client() and entry.client_id = app.client_id() and entry.created_at >= pg_catalog.now() - interval '7 days'
      and entry.created_at <= pg_catalog.now())
    or (app.is_staff() and app.can_access_client(entry.client_id) and app.has_perm(permission_module, 'edit')),
    false) then
    raise exception 'entry is not accessible or the correction window has ended'
      using errcode = '42501', detail = 'rule:app.void_entry';
  end if;
  if entry.voided_at is not null then
    raise exception 'entry is already voided' using errcode = 'P0001', detail = 'rule:app.void_entry';
  end if;
  execute pg_catalog.format('update public.%I set voided_at = pg_catalog.now(), voided_by = $3, void_reason = pg_catalog.left($4, 500) where tenant_id = $1 and id = $2', p_table)
    using tid, p_id, app.uid(), p_reason;
  -- 0006 guard_row and visible_refs trust the owner role; no runtime UPDATE grant is needed on metric_entries.
end $$;
--> statement-breakpoint
revoke all on function app.void_entry(text, uuid, text) from public;
--> statement-breakpoint
create function app.apply_correction() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  replaced record;
begin
  if new.replaces_id is null then
    return new;
  end if;
  if new.replaces_id = new.id then
    raise exception 'a correction cannot replace itself'
      using errcode = 'P0001', detail = 'rule:app.apply_correction', table = tg_table_name, column = 'replaces_id';
  end if;
  if current_user = 'dawlyy_rls' then
    perform app.void_entry(tg_table_name, new.replaces_id, 'corrected');
  else
    execute pg_catalog.format('select id, voided_at from public.%I where tenant_id = $1 and client_id = $2 and id = $3 for update', tg_table_name)
      into replaced using new.tenant_id, new.client_id, new.replaces_id;
    if replaced.id is null then
      raise exception 'replacement must belong to the same tenant and client'
        using errcode = '23503', detail = 'rule:app.apply_correction', table = tg_table_name,
          column = 'replaces_id', constraint = tg_table_name || '_replaces_fk';
    end if;
    if replaced.voided_at is not null then
      raise exception 'entry is already voided'
        using errcode = 'P0001', detail = 'rule:app.apply_correction', table = tg_table_name, column = 'replaces_id';
    end if;
    execute pg_catalog.format('update public.%I set voided_at = pg_catalog.now(), voided_by = $4, void_reason = ''corrected'' where tenant_id = $1 and client_id = $2 and id = $3', tg_table_name)
      using new.tenant_id, new.client_id, new.replaces_id, app.uid();
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.apply_correction() from public;
--> statement-breakpoint
create trigger meal_logs_46_correct after insert on public.meal_logs
  for each row when (new.replaces_id is not null) execute function app.apply_correction();
--> statement-breakpoint
create trigger measurement_sets_46_correct after insert on public.measurement_sets
  for each row when (new.replaces_id is not null) execute function app.apply_correction();
--> statement-breakpoint
create trigger meal_logs_void_audit after update of voided_at on public.meal_logs
  for each row execute function app.audit_row();
--> statement-breakpoint
create trigger metric_entries_void_audit after update of voided_at on public.metric_entries
  for each row execute function app.audit_row();
--> statement-breakpoint
create trigger measurement_sets_void_audit after update of voided_at on public.measurement_sets
  for each row execute function app.audit_row();
--> statement-breakpoint
create trigger workout_sessions_void_audit after update of voided_at on public.workout_sessions
  for each row execute function app.audit_row();
--> statement-breakpoint

-- C. Tenant defaults, with no change to settings policies or attribution guards.
alter table public.business_settings add column client_modules jsonb not null
  default '{"workouts":true,"nutrition":true,"checkins":true,"progress_photos":true,"measurements":true,"messages":true,"payments":true}'::jsonb,
  add constraint business_settings_client_modules_ck check (
    pg_catalog.jsonb_typeof(client_modules) = 'object'
    and client_modules - array['workouts','nutrition','checkins','progress_photos','measurements','messages','payments']::text[] = '{}'::jsonb
    and not pg_catalog.jsonb_path_exists(client_modules, '$.* ? (@.type() != "boolean")')
  );
--> statement-breakpoint

-- D. Private drafts. Like 0006, RLS is enabled, without FORCE: the trusted owner writes via definers.
create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null constraint ai_drafts_tenant_id_tenants_id_fk references public.tenants (id) on delete cascade,
  client_id uuid not null,
  kind text not null,
  input_hash text not null,
  input_version text not null,
  body jsonb not null,
  provider text not null default 'none',
  status text not null default 'draft',
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint ai_drafts_client_fk foreign key (tenant_id, client_id) references public.clients (tenant_id, id) on delete cascade,
  constraint ai_drafts_kind_ck check (kind in ('week_review')),
  constraint ai_drafts_input_hash_ck check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_drafts_input_version_ck check (length(input_version) between 1 and 200),
  constraint ai_drafts_body_ck check (pg_catalog.jsonb_typeof(body) = 'object'),
  constraint ai_drafts_provider_ck check (provider in ('none','anthropic','openrouter')),
  constraint ai_drafts_status_ck check (status in ('draft','approved','rejected','stale'))
);
--> statement-breakpoint
create index ai_drafts_client_created_idx on public.ai_drafts (tenant_id, client_id, created_at desc);
--> statement-breakpoint
alter table public.ai_drafts enable row level security;
--> statement-breakpoint
create policy ai_drafts_tenant_guard on public.ai_drafts as restrictive for all to dawlyy_rls
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
--> statement-breakpoint
create policy ai_drafts_staff_select on public.ai_drafts for select to dawlyy_rls
  using (tenant_id = (select app.tenant_id()) and (select app.is_staff())
    and ((select app.sees_all_clients()) or client_id in (select app.assigned_client_ids())));
--> statement-breakpoint
create policy ai_drafts_staff_insert on public.ai_drafts for insert to dawlyy_rls
  with check (tenant_id = (select app.tenant_id()) and (select app.is_staff())
    and ((select app.sees_all_clients()) or client_id in (select app.assigned_client_ids())));
--> statement-breakpoint
create policy ai_drafts_staff_update on public.ai_drafts for update to dawlyy_rls
  using (tenant_id = (select app.tenant_id()) and (select app.is_staff())
    and ((select app.sees_all_clients()) or client_id in (select app.assigned_client_ids())))
  with check (tenant_id = (select app.tenant_id()) and (select app.is_staff())
    and ((select app.sees_all_clients()) or client_id in (select app.assigned_client_ids())));
--> statement-breakpoint
create trigger ai_drafts_50_guard before insert or update or delete on public.ai_drafts
  for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"status":"draft","approved_by":null,"approved_at":null},"immutable":["id","tenant_id","client_id","kind","input_hash","input_version","provider","created_by","created_at","approved_by","approved_at"],"stamp_update":{"updated_at":"now"},"transitions":{"column":"status","insert":["draft"],"edges":[["draft","rejected"]]},"editable_in":[{"column":"status","states":["draft"],"cols":["body"]}]}');
--> statement-breakpoint
create function app.approve_ai_draft(p_id uuid, p_current_hash text) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  draft record;
begin
  if tid is null or not app.is_staff() or not app.has_perm('checkins', 'review') then
    raise exception 'draft is not accessible' using errcode = '42501', detail = 'rule:app.approve_ai_draft';
  end if;
  select d.client_id, d.status, d.input_hash into draft from public.ai_drafts d
    where d.tenant_id = tid and d.id = p_id for update;
  if not found or not app.can_access_client(draft.client_id) then
    raise exception 'draft is not accessible' using errcode = '42501', detail = 'rule:app.approve_ai_draft';
  end if;
  if draft.status <> 'draft' then
    raise exception 'only a draft can be approved' using errcode = 'P0001', detail = 'rule:app.approve_ai_draft';
  end if;
  if p_current_hash is distinct from draft.input_hash then
    update public.ai_drafts set status = 'stale', updated_at = pg_catalog.now() where tenant_id = tid and id = p_id;
    return 'stale';
  end if;
  update public.ai_drafts set status = 'approved', approved_by = app.uid(), approved_at = pg_catalog.now(),
    updated_at = pg_catalog.now() where tenant_id = tid and id = p_id;
  return 'approved';
end $$;
--> statement-breakpoint
revoke all on function app.approve_ai_draft(uuid, text) from public;
--> statement-breakpoint
create trigger ai_drafts_audit after insert or update of status on public.ai_drafts
  for each row execute function app.audit_row();
--> statement-breakpoint

-- E. Flags derive scope from the source; runtime callers never INSERT the table.
create table public.red_flags (
  id uuid primary key,
  tenant_id uuid not null constraint red_flags_tenant_id_tenants_id_fk references public.tenants (id) on delete cascade,
  client_id uuid not null,
  source text not null,
  source_id uuid not null,
  category text not null,
  matched text not null,
  status text not null default 'open',
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint red_flags_client_fk foreign key (tenant_id, client_id) references public.clients (tenant_id, id) on delete cascade,
  constraint red_flags_source_ck check (source in ('message','checkin','meal_note')),
  constraint red_flags_category_ck check (category in ('pain_injury','eating_disorder','pregnancy','medication','other')),
  constraint red_flags_matched_ck check (length(matched) between 1 and 200),
  constraint red_flags_status_ck check (status in ('open','handled'))
);
--> statement-breakpoint
create unique index red_flags_source_category_uq on public.red_flags (tenant_id, source, source_id, category);
--> statement-breakpoint
create index red_flags_status_created_idx on public.red_flags (tenant_id, status, created_at desc);
--> statement-breakpoint
-- The status index does not cover the composite client FK.
create index red_flags_client_idx on public.red_flags (tenant_id, client_id);
--> statement-breakpoint
alter table public.red_flags enable row level security;
--> statement-breakpoint
create policy red_flags_tenant_guard on public.red_flags as restrictive for all to dawlyy_rls
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
--> statement-breakpoint
create policy red_flags_staff_select on public.red_flags for select to dawlyy_rls
  using (tenant_id = (select app.tenant_id()) and (select app.is_staff())
    and ((select app.sees_all_clients()) or client_id in (select app.assigned_client_ids())));
--> statement-breakpoint
create policy red_flags_staff_update on public.red_flags for update to dawlyy_rls
  using (tenant_id = (select app.tenant_id()) and (select app.is_staff())
    and ((select app.sees_all_clients()) or client_id in (select app.assigned_client_ids())))
  with check (tenant_id = (select app.tenant_id()) and (select app.is_staff())
    and ((select app.sees_all_clients()) or client_id in (select app.assigned_client_ids())));
--> statement-breakpoint
create trigger red_flags_50_guard before insert or update or delete on public.red_flags
  for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","source","source_id","category","matched","created_at","handled_by","handled_at"],"transitions":{"column":"status","insert":["open"],"edges":[["open","handled"]]},"on_transition":{"column":"status","stamps":{"handled":{"handled_by":"uid","handled_at":"now"}}}}');
--> statement-breakpoint
create function app.raise_red_flag(p_source text, p_source_id uuid, p_category text, p_matched text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  cid uuid;
  sender uuid;
  flag_id uuid;
begin
  if p_source is null or p_source not in ('message', 'checkin', 'meal_note')
     or p_category is null or p_category not in ('pain_injury', 'eating_disorder', 'pregnancy', 'medication', 'other') then
    raise exception 'invalid flag source or category' using errcode = '22023', detail = 'rule:app.raise_red_flag';
  end if;
  if tid is null or app.uid() is null then
    raise exception 'source is not accessible' using errcode = '42501', detail = 'rule:app.raise_red_flag';
  end if;
  if p_source = 'message' then
    select c.client_id, m.sender_user_id into cid, sender from public.messages m
      join public.conversations c on c.tenant_id = m.tenant_id and c.id = m.conversation_id and c.client_id = m.client_id
      where m.tenant_id = tid and m.id = p_source_id and c.kind = 'client';
  elsif p_source = 'checkin' then
    select s.client_id into cid from public.form_submissions s where s.tenant_id = tid and s.id = p_source_id;
  else
    select m.client_id into cid from public.meal_logs m where m.tenant_id = tid and m.id = p_source_id;
  end if;
  if cid is null or not coalesce(
    (app.is_client() and cid = app.client_id() and (p_source <> 'message' or sender = app.uid()))
    or (app.is_staff() and app.can_access_client(cid)), false) then
    raise exception 'source is not accessible' using errcode = '42501', detail = 'rule:app.raise_red_flag';
  end if;
  insert into public.red_flags (id, tenant_id, client_id, source, source_id, category, matched)
    values (pg_catalog.gen_random_uuid(), tid, cid, p_source, p_source_id, p_category, p_matched)
    on conflict (tenant_id, source, source_id, category) do nothing returning id into flag_id;
  if flag_id is null then
    select r.id into flag_id from public.red_flags r where r.tenant_id = tid and r.source = p_source
      and r.source_id = p_source_id and r.category = p_category;
  end if;
  return flag_id;
end $$;
--> statement-breakpoint
revoke all on function app.raise_red_flag(text, uuid, text, text) from public;
--> statement-breakpoint
create trigger red_flags_audit after insert or update of status on public.red_flags
  for each row execute function app.audit_row();
--> statement-breakpoint

-- F. 0006 / security model §11.4: Supabase service_role also receives NO object grant.
revoke all on table public.ai_drafts, public.red_flags from public;
--> statement-breakpoint
do $$
begin
  begin
    revoke all on table public.ai_drafts, public.red_flags from anon;
  exception when undefined_object then null;
  end;
  begin
    revoke all on table public.ai_drafts, public.red_flags from authenticated;
  exception when undefined_object then null;
  end;
  begin
    revoke all on table public.ai_drafts, public.red_flags from service_role;
  exception when undefined_object then null;
  end;
end $$;
--> statement-breakpoint
grant select, insert, update on public.ai_drafts to dawlyy_rls;
--> statement-breakpoint
grant select, update on public.red_flags to dawlyy_rls;
--> statement-breakpoint
grant execute on function app.void_entry(text, uuid, text), app.approve_ai_draft(uuid, text),
  app.raise_red_flag(text, uuid, text, text) to dawlyy_rls;
--> statement-breakpoint
