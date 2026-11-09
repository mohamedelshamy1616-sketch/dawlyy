-- DAWLYY 0006: guards, definer functions, audit triggers and the privileges of dawlyy_rls.
-- doc §11.3: validate bodies and withhold PUBLIC execute from new functions.
set check_function_bodies = on;
--> statement-breakpoint
-- Functions created from here on get no PUBLIC execute (global form; the in-schema form does nothing, §3.4).
alter default privileges for role postgres revoke execute on functions from public;
--> statement-breakpoint

-- doc §9.2.
-- doc §9.2: app.audit_actions.
create table if not exists app.audit_actions (
  action text primary key,
  entity text not null,
  roles text[] not null,
  constraint audit_actions_action_ck check (action ~ '^[a-z_]+[.][a-z_]+$'),
  constraint audit_actions_roles_ck check (cardinality(roles) > 0 and roles <@ array['owner', 'staff', 'client']::text[])
);
--> statement-breakpoint
-- doc §9.2: app.event_types.
create table if not exists app.event_types (
  type text primary key,
  roles text[] not null,
  constraint event_types_type_ck check (type ~ '^[a-z_]+[.][a-z_]+$'),
  constraint event_types_roles_ck check (cardinality(roles) > 0 and roles <@ array['owner', 'staff', 'client']::text[])
);
--> statement-breakpoint
alter table app.audit_actions enable row level security;
--> statement-breakpoint
alter table app.event_types enable row level security;
--> statement-breakpoint
revoke all on table app.audit_actions, app.event_types from public;
--> statement-breakpoint
insert into app.audit_actions (action, entity, roles) values
  ('program.publish',        'program_versions',        '{owner,staff}'),
  ('program.archive',        'program_versions',        '{owner,staff}'),
  ('nutrition_plan.publish', 'nutrition_plan_versions', '{owner,staff}'),
  ('nutrition_plan.archive', 'nutrition_plan_versions', '{owner,staff}'),
  ('form.publish',           'form_versions',           '{owner,staff}'),
  ('form.archive',           'form_versions',           '{owner,staff}'),
  ('payment.verify',         'payments',                '{owner,staff}'),
  ('payment.reject',         'payments',                '{owner,staff}'),
  ('payment.refund',         'payments',                '{owner,staff}'),
  ('subscription.extend',    'subscriptions',           '{owner,staff}'),
  ('subscription.freeze',    'subscriptions',           '{owner,staff}'),
  ('subscription.resume',    'subscriptions',           '{owner,staff}'),
  ('subscription.cancel',    'subscriptions',           '{owner,staff}'),
  ('subscription.suspend',   'subscriptions',           '{owner,staff}'),
  ('subscription.reinstate', 'subscriptions',           '{owner,staff}'),
  ('client.erase',           'clients',                 '{owner}'),
  ('checkin.submit',         'form_submissions',        '{client}'),
  ('checkin.review',         'form_submissions',        '{owner,staff}'),
  ('workout.complete',       'workout_sessions',        '{client}'),
  ('media.review',           'media',                   '{owner,staff}'),
  ('ai.approve',             'ai_requests',             '{owner,staff}'),
  ('ai.reject',              'ai_requests',             '{owner,staff}'),
  ('team.permissions',       'memberships',             '{owner}'),
  ('team.disable',           'memberships',             '{owner}')
on conflict (action) do update set entity = excluded.entity, roles = excluded.roles;
--> statement-breakpoint
insert into app.event_types (type, roles) values
  ('program.published',        '{owner,staff}'),
  ('nutrition_plan.published', '{owner,staff}'),
  ('form.published',           '{owner,staff}'),
  ('payment.submitted',        '{client}'),
  ('payment.verified',         '{owner,staff}'),
  ('payment.rejected',         '{owner,staff}'),
  ('payment.refunded',         '{owner,staff}'),
  ('subscription.extended',    '{owner,staff}'),
  ('subscription.frozen',      '{owner,staff}'),
  ('subscription.resumed',     '{owner,staff}'),
  ('subscription.cancelled',   '{owner,staff}'),
  ('checkin.submitted',        '{client}'),
  ('checkin.reviewed',         '{owner,staff}'),
  ('workout.completed',        '{client}'),
  ('message.sent',             '{owner,staff,client}'),
  ('media.uploaded',           '{owner,staff,client}'),
  ('media.reviewed',           '{owner,staff}'),
  ('ai.approved',              '{owner,staff}')
on conflict (type) do update set roles = excluded.roles;
--> statement-breakpoint

-- doc §6.2.
-- Resolve a stamp spec { column: 'uid' | 'role' | 'now' | 'null' } to concrete values.
-- doc §6.2: app.guard_resolve.
create or replace function app.guard_resolve(spec jsonb, who text) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  k text;
  v text;
  resolved jsonb := '{}'::jsonb;
begin
  for k, v in select key, value from jsonb_each_text(coalesce(spec, '{}'::jsonb)) loop
    if v is null or v not in ('uid', 'role', 'now', 'null') then
      raise exception 'guard: unknown stamp token % for column %', v, k
        using detail = 'guard:stamp', column = k;
    end if;
    resolved := resolved || jsonb_build_object(k, case v
      when 'uid' then to_jsonb(app.uid())
      when 'role' then to_jsonb(who)
      when 'null' then 'null'::jsonb
      else to_jsonb(now())
    end);
  end loop;
  return resolved;
end $$;
--> statement-breakpoint

-- Column, state, permission and attribution rules for statements run by the runtime role. See §6.1 for the keys.
-- doc §6.2: app.guard_row.
create or replace function app.guard_row() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cfg jsonb := coalesce(nullif(tg_argv[0], ''), '{}')::jsonb;
  who text;
  newj jsonb;
  oldj jsonb;
  stamps jsonb := '{}'::jsonb;
  allowed jsonb;
  akey text;
  rkey text;
  mkey text;
  skip jsonb;
  machine jsonb;
  rule jsonb;
  perm jsonb;
  bad text;
  col text;
  st_old jsonb;
  st_new jsonb;
  lower_than boolean;
begin
  -- Service transactions, SECURITY DEFINER functions and foreign-key actions run as another role: trusted.
  if current_user <> 'dawlyy_rls' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  who := app.role();
  if who is null then
    raise exception 'no active membership'
      using errcode = '42501', detail = 'guard:no_membership', table = tg_table_name;
  end if;

  -- Module permission for this operation (staff only: the owner passes, clients follow their own keys).
  if who = 'staff' then
    perm := cfg #> array['require_perm', lower(tg_op)];
    if perm is not null and not app.has_perm(perm ->> 0, perm ->> 1) then
      raise exception '%: % requires the % % permission', tg_table_name, lower(tg_op), perm ->> 0, perm ->> 1
        using errcode = '42501', detail = 'guard:require_perm', table = tg_table_name;
    end if;
  end if;

  if tg_op = 'DELETE' then
    if cfg ? 'delete_when' then
      col := cfg #>> '{delete_when,column}';
      if not (cfg #> '{delete_when,states}') @> jsonb_build_array(to_jsonb(old) -> col) then
        raise exception '%: a row whose % is % cannot be deleted', tg_table_name, col, to_jsonb(old) ->> col
          using errcode = 'P0001', detail = 'guard:delete_when', table = tg_table_name, column = col;
      end if;
    end if;
    return old;
  end if;

  newj := to_jsonb(new);

  if tg_op = 'INSERT' then
    select string_agg(e.key, ', '), (array_agg(e.src))[1] into bad, rkey
      from (select m.key, m.value,
                   case when who = 'client' and (cfg -> 'client_insert_eq') ? m.key then 'client_insert_eq' else 'insert_eq' end as src
              from jsonb_each(coalesce(cfg -> 'insert_eq', '{}'::jsonb)
                              || case when who = 'client' then coalesce(cfg -> 'client_insert_eq', '{}'::jsonb) else '{}'::jsonb end) m) e
     where (newj -> e.key) is distinct from e.value;
    if bad is not null then
      raise exception '%: % cannot be set on insert', tg_table_name, bad
        using errcode = '42501', detail = 'guard:' || rkey, table = tg_table_name, column = split_part(bad, ', ', 1);
    end if;

    foreach mkey in array array['transitions', 'client_transitions'] loop
      machine := case when mkey = 'transitions' or who = 'client' then cfg -> mkey end;
      continue when machine is null or not machine ? 'insert';
      col := machine ->> 'column';
      if not (machine -> 'insert') @> jsonb_build_array(newj -> col) then
        raise exception '%: a new row cannot start with % = %', tg_table_name, col, newj -> col
          using errcode = 'P0001', detail = 'guard:' || mkey, table = tg_table_name, column = col;
      end if;
    end loop;

    -- The server clock owns created_at and updated_at on every runtime insert, whatever the caller sent.
    if newj ? 'created_at' then
      stamps := stamps || jsonb_build_object('created_at', now());
    end if;
    if newj ? 'updated_at' then
      stamps := stamps || jsonb_build_object('updated_at', now());
    end if;
    stamps := stamps || app.guard_resolve(cfg -> 'stamp_insert', who);
  else
    oldj := to_jsonb(old);
    skip := coalesce(cfg -> 'stamp_update', '{}'::jsonb);

    select string_agg(c, ', ') into bad
      from jsonb_array_elements_text(coalesce(cfg -> 'immutable', '[]'::jsonb)) c
     where (newj -> c) is distinct from (oldj -> c);
    if bad is not null then
      raise exception '%: % cannot be changed', tg_table_name, bad
        using errcode = '42501', detail = 'guard:immutable', table = tg_table_name, column = split_part(bad, ', ', 1);
    end if;

    select string_agg(c, ', ') into bad
      from jsonb_array_elements_text(coalesce(cfg -> 'set_once', '[]'::jsonb)) c
     where (oldj -> c) <> 'null'::jsonb and (newj -> c) is distinct from (oldj -> c);
    if bad is not null then
      raise exception '%: % is already set', tg_table_name, bad
        using errcode = '42501', detail = 'guard:set_once', table = tg_table_name, column = split_part(bad, ', ', 1);
    end if;

    -- A toggle column (an on_clear key) goes from null to a value or back to null, never from one value to another.
    select string_agg(c, ', ') into bad
      from jsonb_object_keys(coalesce(cfg -> 'on_clear', '{}'::jsonb)) c
     where (oldj -> c) <> 'null'::jsonb and (newj -> c) <> 'null'::jsonb and (newj -> c) is distinct from (oldj -> c);
    if bad is not null then
      raise exception '%: % is already set; clear it first', tg_table_name, bad
        using errcode = '42501', detail = 'guard:on_clear', table = tg_table_name, column = split_part(bad, ', ', 1);
    end if;

    akey := case who
      when 'client' then case when cfg ? 'client_update' then 'client_update' else 'update_allow' end
      when 'staff' then case when cfg ? 'staff_update' then 'staff_update' else 'update_allow' end
      else 'update_allow'
    end;
    allowed := cfg -> akey;
    if who = 'client' and allowed is null then
      raise exception '%: clients cannot change these rows', tg_table_name
        using errcode = '42501', detail = 'guard:client_update', table = tg_table_name;
    end if;
    if allowed is not null then
      select string_agg(n.key, ', ') into bad
        from jsonb_each(newj) n
       where n.value is distinct from (oldj -> n.key)
         and not (allowed ? n.key)
         and not (skip ? n.key);
      if bad is not null then
        raise exception '%: % cannot be changed by %', tg_table_name, bad, who
          using errcode = '42501', detail = 'guard:' || akey, table = tg_table_name, column = split_part(bad, ', ', 1);
      end if;
    end if;

    -- A listed column may only be changed to the listed value (unread counters: reset to 0).
    select string_agg(e.key, ', ') into bad
      from jsonb_each(coalesce(cfg -> 'update_to', '{}'::jsonb)) e
     where (newj -> e.key) is distinct from (oldj -> e.key)
       and (newj -> e.key) is distinct from e.value;
    if bad is not null then
      raise exception '%: % can only be set to its reset value', tg_table_name, bad
        using errcode = '42501', detail = 'guard:update_to', table = tg_table_name, column = split_part(bad, ', ', 1);
    end if;

    -- A listed column never decreases and never goes back to null (numeric and timestamp columns only).
    for col in select jsonb_array_elements_text(coalesce(cfg -> 'monotonic', '[]'::jsonb)) loop
      st_old := oldj -> col;
      st_new := newj -> col;
      if st_new is distinct from st_old and st_old <> 'null'::jsonb then
        if st_new = 'null'::jsonb then
          lower_than := true;
        elsif jsonb_typeof(st_new) = 'number' then
          lower_than := (st_new #>> '{}')::numeric < (st_old #>> '{}')::numeric;
        else
          lower_than := (st_new #>> '{}')::timestamptz < (st_old #>> '{}')::timestamptz;
        end if;
        if lower_than then
          raise exception '%: % cannot decrease (stale write)', tg_table_name, col
            using errcode = 'P0001', detail = 'guard:monotonic', table = tg_table_name, column = col;
        end if;
      end if;
    end loop;

    for rule in select jsonb_array_elements(coalesce(cfg -> 'editable_in', '[]'::jsonb)) loop
      col := rule ->> 'column';
      if not (rule -> 'states') @> jsonb_build_array(oldj -> col) then
        select string_agg(c, ', ') into bad
          from jsonb_array_elements_text(rule -> 'cols') c
         where (newj -> c) is distinct from (oldj -> c);
        if bad is not null then
          raise exception '%: % can only change while % is one of %', tg_table_name, bad, col, rule -> 'states'
            using errcode = 'P0001', detail = 'guard:editable_in', table = tg_table_name, column = split_part(bad, ', ', 1);
        end if;
      end if;
    end loop;

    foreach mkey in array array['transitions', 'client_transitions'] loop
      machine := case when mkey = 'transitions' or who = 'client' then cfg -> mkey end;
      continue when machine is null;
      col := machine ->> 'column';
      st_old := oldj -> col;
      st_new := newj -> col;
      if st_new is distinct from st_old and not exists (
        select 1 from jsonb_array_elements(machine -> 'edges') e where e -> 0 = st_old and e -> 1 = st_new
      ) then
        raise exception '%: % cannot move from % to %', tg_table_name, col, st_old, st_new
          using errcode = 'P0001', detail = 'guard:' || mkey, table = tg_table_name, column = col;
      end if;
    end loop;

    stamps := app.guard_resolve(skip, who);
  end if;

  -- Entering a state needs the module permission the config names for that state (staff only).
  if who = 'staff' and cfg ? 'perm_transitions' then
    col := cfg #>> '{transitions,column}';
    if tg_op = 'INSERT' or (newj -> col) is distinct from (oldj -> col) then
      perm := cfg -> 'perm_transitions' -> (newj ->> col);
      if perm is not null and not app.has_perm(perm ->> 0, perm ->> 1) then
        raise exception '%: moving % to % requires the % % permission', tg_table_name, col, newj ->> col,
          perm ->> 0, perm ->> 1
          using errcode = '42501', detail = 'guard:perm_transitions', table = tg_table_name, column = col;
      end if;
    end if;
  end if;

  -- Entering a state stamps columns (also on insert).
  if cfg ? 'on_transition' then
    col := cfg #>> '{on_transition,column}';
    if (newj -> col) is distinct from (case when tg_op = 'UPDATE' then oldj -> col end)
       and (cfg #> '{on_transition,stamps}') ? (newj ->> col) then
      stamps := stamps || app.guard_resolve(cfg #> array['on_transition', 'stamps', newj ->> col], who);
    end if;
  end if;

  -- A column going from null to a value stamps columns (also on insert).
  for col in select jsonb_object_keys(coalesce(cfg -> 'on_set', '{}'::jsonb)) loop
    if (newj -> col) <> 'null'::jsonb and (tg_op = 'INSERT' or (oldj -> col) = 'null'::jsonb) then
      stamps := stamps || app.guard_resolve(cfg -> 'on_set' -> col, who);
    end if;
  end loop;

  -- A column going from a value back to null stamps columns (reopen).
  if tg_op = 'UPDATE' then
    for col in select jsonb_object_keys(coalesce(cfg -> 'on_clear', '{}'::jsonb)) loop
      if (newj -> col) = 'null'::jsonb and (oldj -> col) <> 'null'::jsonb then
        stamps := stamps || app.guard_resolve(cfg -> 'on_clear' -> col, who);
      end if;
    end loop;
  end if;

  if stamps <> '{}'::jsonb then
    new := jsonb_populate_record(new, stamps);
  end if;
  return new;
end $$;
--> statement-breakpoint

-- doc §6.3.
drop trigger if exists tenants_50_guard on public.tenants;
--> statement-breakpoint
-- doc §6.3: tenants_50_guard.
create trigger tenants_50_guard before insert or update or delete on public.tenants for each row execute function app.guard_row('{"immutable":["id","client_counter","receipt_counter","created_at"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists memberships_50_guard on public.memberships;
--> statement-breakpoint
-- doc §6.3: memberships_50_guard.
create trigger memberships_50_guard before insert or update or delete on public.memberships for each row execute function app.guard_row('{"immutable":["id","tenant_id","user_id","client_id","created_at"],"stamp_update":{"updated_at":"now"},"client_update":["display_name","phone","locale","last_seen_at"],"staff_update":["display_name","phone","locale","last_seen_at"]}');
--> statement-breakpoint
drop trigger if exists staff_client_assignments_50_guard on public.staff_client_assignments;
--> statement-breakpoint
-- doc §6.3: staff_client_assignments_50_guard.
create trigger staff_client_assignments_50_guard before insert or update or delete on public.staff_client_assignments for each row execute function app.guard_row('{"stamp_insert":{"assigned_by":"uid"}}');
--> statement-breakpoint
drop trigger if exists invitations_50_guard on public.invitations;
--> statement-breakpoint
-- doc §6.3: invitations_50_guard.
create trigger invitations_50_guard before insert or update or delete on public.invitations for each row execute function app.guard_row('{"stamp_insert":{"invited_by":"uid"},"insert_eq":{"status":"pending","accepted_at":null,"accepted_user_id":null},"immutable":["id","tenant_id","token_hash","role","client_id","invited_by","accepted_at","accepted_user_id","created_at"],"staff_update":["status"],"transitions":{"column":"status","insert":["pending"],"edges":[["pending","revoked"],["pending","expired"]]}}');
--> statement-breakpoint
drop trigger if exists business_settings_50_guard on public.business_settings;
--> statement-breakpoint
-- doc §6.3: business_settings_50_guard.
create trigger business_settings_50_guard before insert or update or delete on public.business_settings for each row execute function app.guard_row('{"stamp_insert":{"updated_by":"uid"},"immutable":["tenant_id"],"stamp_update":{"updated_by":"uid","updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists user_preferences_50_guard on public.user_preferences;
--> statement-breakpoint
-- doc §6.3: user_preferences_50_guard.
create trigger user_preferences_50_guard before insert or update or delete on public.user_preferences for each row execute function app.guard_row('{"immutable":["tenant_id","user_id"],"update_allow":["preferences"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists consents_50_guard on public.consents;
--> statement-breakpoint
-- doc §6.3: consents_50_guard.
create trigger consents_50_guard before insert or update or delete on public.consents for each row execute function app.guard_row('{"stamp_insert":{"accepted_at":"now"},"insert_eq":{"withdrawn_at":null},"update_allow":["withdrawn_at"],"set_once":["withdrawn_at"],"on_set":{"withdrawn_at":{"withdrawn_at":"now"}}}');
--> statement-breakpoint
drop trigger if exists clients_50_guard on public.clients;
--> statement-breakpoint
-- doc §6.3: clients_50_guard.
create trigger clients_50_guard before insert or update or delete on public.clients for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"code":"","membership_id":null},"immutable":["id","tenant_id","code","membership_id","created_by","created_at"],"stamp_update":{"updated_at":"now"},"client_update":["first_name","last_name","display_name","email","phone","whatsapp","birth_date","locale","timezone","profile","search_key"]}');
--> statement-breakpoint
drop trigger if exists client_notes_50_guard on public.client_notes;
--> statement-breakpoint
-- doc §6.3: client_notes_50_guard.
create trigger client_notes_50_guard before insert or update or delete on public.client_notes for each row execute function app.guard_row('{"stamp_insert":{"author_user_id":"uid"},"immutable":["id","tenant_id","client_id","author_user_id","created_at"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists client_flags_50_guard on public.client_flags;
--> statement-breakpoint
-- doc §6.3: client_flags_50_guard.
create trigger client_flags_50_guard before insert or update or delete on public.client_flags for each row execute function app.guard_row('{"stamp_insert":{"raised_at":"now"},"insert_eq":{"resolved_by":null},"immutable":["id","tenant_id","client_id","raised_at","resolved_by"],"on_set":{"resolved_at":{"resolved_at":"now","resolved_by":"uid"}},"on_clear":{"resolved_at":{"resolved_by":"null"}}}');
--> statement-breakpoint
drop trigger if exists tasks_50_guard on public.tasks;
--> statement-breakpoint
-- doc §6.3: tasks_50_guard.
create trigger tasks_50_guard before insert or update or delete on public.tasks for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"completed_at":null,"completed_by":null,"source":"manual","source_event_id":null,"dedupe_key":null},"immutable":["id","tenant_id","client_id","created_by","created_at","completed_at","completed_by","source","source_event_id","dedupe_key"],"stamp_update":{"updated_at":"now"},"transitions":{"column":"state","insert":["open"],"edges":[["open","snoozed"],["snoozed","open"],["open","done"],["snoozed","done"],["open","cancelled"],["snoozed","cancelled"],["done","open"],["cancelled","open"]]},"on_transition":{"column":"state","stamps":{"done":{"completed_at":"now","completed_by":"uid"},"open":{"completed_at":"null","completed_by":"null"},"snoozed":{"completed_at":"null","completed_by":"null"},"cancelled":{"completed_at":"null","completed_by":"null"}}}}');
--> statement-breakpoint
drop trigger if exists ai_requests_50_guard on public.ai_requests;
--> statement-breakpoint
-- doc §6.3: ai_requests_50_guard.
create trigger ai_requests_50_guard before insert or update or delete on public.ai_requests for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"approved_by":null,"approved_at":null},"immutable":["id","tenant_id","client_id","kind","input","created_by","created_at","approved_by","approved_at"],"editable_in":[{"column":"state","states":["draft"],"cols":["output","model"]}],"transitions":{"column":"state","insert":["draft"],"edges":[["draft","approved"],["draft","rejected"]]},"perm_transitions":{"approved":["ai","publish"]},"on_transition":{"column":"state","stamps":{"approved":{"approved_at":"now","approved_by":"uid"}}}}');
--> statement-breakpoint
drop trigger if exists packages_50_guard on public.packages;
--> statement-breakpoint
-- doc §6.3: packages_50_guard.
create trigger packages_50_guard before insert or update or delete on public.packages for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"immutable":["id","tenant_id","created_by","created_at"],"stamp_update":{"updated_at":"now"},"require_perm":{"insert":["packages","create"],"update":["packages","edit"],"delete":["packages","delete"]}}');
--> statement-breakpoint
drop trigger if exists subscriptions_50_guard on public.subscriptions;
--> statement-breakpoint
-- doc §6.3: subscriptions_50_guard.
create trigger subscriptions_50_guard before insert or update or delete on public.subscriptions for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"immutable":["id","tenant_id","client_id","package_id","package_snapshot","price","currency","created_by","created_at"],"stamp_update":{"updated_at":"now"},"require_perm":{"insert":["billing","create"],"update":["billing","edit"]},"transitions":{"column":"state","insert":["pending","active"],"edges":[["pending","active"],["active","grace"],["active","expired"],["grace","expired"],["active","paused"],["paused","active"],["active","cancelled"],["grace","cancelled"],["paused","cancelled"],["pending","cancelled"],["suspended","cancelled"],["pending","suspended"],["active","suspended"],["grace","suspended"],["paused","suspended"],["expired","suspended"],["suspended","active"],["expired","active"],["grace","active"]]}}');
--> statement-breakpoint
drop trigger if exists subscription_events_50_guard on public.subscription_events;
--> statement-breakpoint
-- doc §6.3: subscription_events_50_guard.
create trigger subscription_events_50_guard before insert or update or delete on public.subscription_events for each row execute function app.guard_row('{"stamp_insert":{"actor_user_id":"uid"},"require_perm":{"insert":["billing","edit"]}}');
--> statement-breakpoint
drop trigger if exists client_entitlement_overrides_50_guard on public.client_entitlement_overrides;
--> statement-breakpoint
-- doc §6.3: client_entitlement_overrides_50_guard.
create trigger client_entitlement_overrides_50_guard before insert or update or delete on public.client_entitlement_overrides for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"revoked_at":null},"update_allow":["revoked_at"],"set_once":["revoked_at"],"on_set":{"revoked_at":{"revoked_at":"now"}},"require_perm":{"insert":["billing","edit"],"update":["billing","edit"]}}');
--> statement-breakpoint
drop trigger if exists payments_50_guard on public.payments;
--> statement-breakpoint
-- doc §6.3: payments_50_guard.
create trigger payments_50_guard before insert or update or delete on public.payments for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"verified_at":null,"verified_by":null,"receipt_no":null,"refunded_at":null,"refund_amount":null,"rejected_reason":null},"client_insert_eq":{"state":"pending","notes":null,"provider":null,"provider_ref":null},"immutable":["id","tenant_id","client_id","created_by","created_at","verified_at","verified_by","receipt_no","refunded_at","provider","provider_ref"],"set_once":["subscription_id"],"monotonic":["refund_amount"],"stamp_update":{"updated_at":"now"},"client_update":["proof_media_id","reference","paid_at"],"editable_in":[{"column":"state","states":["pending"],"cols":["amount","currency","method","proof_media_id","reference","paid_at"]},{"column":"state","states":["verified"],"cols":["refund_amount"]},{"column":"state","states":["pending"],"cols":["rejected_reason"]}],"transitions":{"column":"state","insert":["pending","verified"],"edges":[["pending","verified"],["pending","rejected"],["verified","refunded"]]},"perm_transitions":{"verified":["billing","verify"],"rejected":["billing","verify"],"refunded":["billing","verify"]},"require_perm":{"insert":["billing","create"],"update":["billing","edit"]},"on_transition":{"column":"state","stamps":{"verified":{"verified_at":"now","verified_by":"uid"}}},"on_set":{"refund_amount":{"refunded_at":"now"}}}');
--> statement-breakpoint
drop trigger if exists exercises_50_guard on public.exercises;
--> statement-breakpoint
-- doc §6.3: exercises_50_guard.
create trigger exercises_50_guard before insert or update or delete on public.exercises for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"immutable":["id","tenant_id","created_by","created_at"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists foods_50_guard on public.foods;
--> statement-breakpoint
-- doc §6.3: foods_50_guard.
create trigger foods_50_guard before insert or update or delete on public.foods for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"immutable":["id","tenant_id","created_by","created_at"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists tenant_hidden_items_50_guard on public.tenant_hidden_items;
--> statement-breakpoint
-- doc §6.3: tenant_hidden_items_50_guard.
create trigger tenant_hidden_items_50_guard before insert or update or delete on public.tenant_hidden_items for each row execute function app.guard_row('{"stamp_insert":{"hidden_by":"uid"}}');
--> statement-breakpoint
drop trigger if exists programs_50_guard on public.programs;
--> statement-breakpoint
-- doc §6.3: programs_50_guard.
create trigger programs_50_guard before insert or update or delete on public.programs for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_version_id":null},"immutable":["id","tenant_id","kind","client_id","template_id","created_by","created_at","published_version_id"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists nutrition_plans_50_guard on public.nutrition_plans;
--> statement-breakpoint
-- doc §6.3: nutrition_plans_50_guard.
create trigger nutrition_plans_50_guard before insert or update or delete on public.nutrition_plans for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_version_id":null},"immutable":["id","tenant_id","kind","client_id","template_id","created_by","created_at","published_version_id"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists forms_50_guard on public.forms;
--> statement-breakpoint
-- doc §6.3: forms_50_guard.
create trigger forms_50_guard before insert or update or delete on public.forms for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_version_id":null},"immutable":["id","tenant_id","kind","form_kind","client_id","template_id","created_by","created_at","published_version_id"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists program_versions_50_guard on public.program_versions;
--> statement-breakpoint
-- doc §6.3: program_versions_50_guard.
create trigger program_versions_50_guard before insert or update or delete on public.program_versions for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_at":null,"published_by":null,"superseded_at":null},"immutable":["id","tenant_id","client_id","program_id","version_no","created_by","created_at","published_at","published_by","superseded_at"],"editable_in":[{"column":"status","states":["draft"],"cols":["document","change_note"]}],"transitions":{"column":"status","insert":["draft","published"],"edges":[["draft","in_review"],["in_review","approved"],["in_review","draft"],["approved","published"],["draft","published"],["published","superseded"],["draft","archived"],["in_review","archived"],["approved","archived"],["published","archived"],["superseded","archived"]]},"perm_transitions":{"published":["programs","publish"]},"on_transition":{"column":"status","stamps":{"published":{"published_at":"now","published_by":"uid"},"superseded":{"superseded_at":"now"}}},"delete_when":{"column":"status","states":["draft"]}}');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_50_guard on public.nutrition_plan_versions;
--> statement-breakpoint
-- doc §6.3: nutrition_plan_versions_50_guard.
create trigger nutrition_plan_versions_50_guard before insert or update or delete on public.nutrition_plan_versions for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_at":null,"published_by":null,"superseded_at":null},"immutable":["id","tenant_id","client_id","plan_id","version_no","created_by","created_at","published_at","published_by","superseded_at"],"editable_in":[{"column":"status","states":["draft"],"cols":["document","change_note"]}],"transitions":{"column":"status","insert":["draft","published"],"edges":[["draft","in_review"],["in_review","approved"],["in_review","draft"],["approved","published"],["draft","published"],["published","superseded"],["draft","archived"],["in_review","archived"],["approved","archived"],["published","archived"],["superseded","archived"]]},"perm_transitions":{"published":["nutrition","publish"]},"on_transition":{"column":"status","stamps":{"published":{"published_at":"now","published_by":"uid"},"superseded":{"superseded_at":"now"}}},"delete_when":{"column":"status","states":["draft"]}}');
--> statement-breakpoint
drop trigger if exists form_versions_50_guard on public.form_versions;
--> statement-breakpoint
-- doc §6.3: form_versions_50_guard.
create trigger form_versions_50_guard before insert or update or delete on public.form_versions for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_at":null,"published_by":null,"superseded_at":null},"immutable":["id","tenant_id","client_id","form_id","version_no","created_by","created_at","published_at","published_by","superseded_at"],"editable_in":[{"column":"status","states":["draft"],"cols":["document","change_note"]}],"transitions":{"column":"status","insert":["draft","published"],"edges":[["draft","in_review"],["in_review","approved"],["in_review","draft"],["approved","published"],["draft","published"],["published","superseded"],["draft","archived"],["in_review","archived"],["approved","archived"],["published","archived"],["superseded","archived"]]},"perm_transitions":{"published":["forms","publish"]},"on_transition":{"column":"status","stamps":{"published":{"published_at":"now","published_by":"uid"},"superseded":{"superseded_at":"now"}}},"delete_when":{"column":"status","states":["draft"]}}');
--> statement-breakpoint
drop trigger if exists metric_entries_50_guard on public.metric_entries;
--> statement-breakpoint
-- doc §6.3: metric_entries_50_guard.
create trigger metric_entries_50_guard before insert or update or delete on public.metric_entries for each row execute function app.guard_row('{"client_insert_eq":{"source":"manual"}}');
--> statement-breakpoint
drop trigger if exists measurement_sets_50_guard on public.measurement_sets;
--> statement-breakpoint
-- doc §6.3: measurement_sets_50_guard.
create trigger measurement_sets_50_guard before insert or update or delete on public.measurement_sets for each row execute function app.guard_row('{"client_insert_eq":{"taken_by":"client"},"immutable":["id","tenant_id","client_id","client_uuid","taken_by","created_at"],"monotonic":["client_updated_at"],"client_update":["local_date","values","note","client_updated_at"]}');
--> statement-breakpoint
drop trigger if exists progress_photo_sets_50_guard on public.progress_photo_sets;
--> statement-breakpoint
-- doc §6.3: progress_photo_sets_50_guard.
create trigger progress_photo_sets_50_guard before insert or update or delete on public.progress_photo_sets for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","client_uuid","created_at"],"monotonic":["client_updated_at"],"client_update":["local_date","poses","weight_kg","note","client_updated_at"]}');
--> statement-breakpoint
drop trigger if exists inbody_records_50_guard on public.inbody_records;
--> statement-breakpoint
-- doc §6.3: inbody_records_50_guard.
create trigger inbody_records_50_guard before insert or update or delete on public.inbody_records for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"client_insert_eq":{"source":"manual"},"immutable":["id","tenant_id","client_id","created_by","created_at","normalized"],"client_update":["local_date","raw_media_id","fields","note"],"insert_eq":{"normalized":{}}}');
--> statement-breakpoint
drop trigger if exists workout_sessions_50_guard on public.workout_sessions;
--> statement-breakpoint
-- doc §6.3: workout_sessions_50_guard.
create trigger workout_sessions_50_guard before insert or update or delete on public.workout_sessions for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","program_id","program_version_id","phase_id","week_id","day_id","workout_id","planned_workout","client_uuid","created_at","summary"],"monotonic":["client_updated_at"],"stamp_update":{"updated_at":"now"},"client_update":["state","local_date","timezone","started_at","ended_at","active_seconds","rpe_overall","mood","pain_note","client_note","client_updated_at"],"insert_eq":{"summary":null}}');
--> statement-breakpoint
drop trigger if exists set_logs_50_guard on public.set_logs;
--> statement-breakpoint
-- doc §6.3: set_logs_50_guard.
create trigger set_logs_50_guard before insert or update or delete on public.set_logs for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","session_id","client_uuid","created_at"],"monotonic":["client_updated_at"],"client_update":["exercise_id","block_id","item_id","set_no","tag","reps","load","load_unit","duration_sec","distance_m","rpe","rir","rest_sec","completed","skipped","substituted_for","pain_flag","note","client_updated_at","deleted_at"]}');
--> statement-breakpoint
drop trigger if exists meal_logs_50_guard on public.meal_logs;
--> statement-breakpoint
-- doc §6.3: meal_logs_50_guard.
create trigger meal_logs_50_guard before insert or update or delete on public.meal_logs for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","client_uuid","created_at"],"monotonic":["client_updated_at"],"client_update":["plan_version_id","local_date","meal_id","option_id","free_entry","status","note","client_updated_at","recorded_at"]}');
--> statement-breakpoint
drop trigger if exists supplement_logs_50_guard on public.supplement_logs;
--> statement-breakpoint
-- doc §6.3: supplement_logs_50_guard.
create trigger supplement_logs_50_guard before insert or update or delete on public.supplement_logs for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","client_uuid"],"monotonic":["client_updated_at"],"client_update":["plan_version_id","supplement_id","local_date","taken","client_updated_at","recorded_at"]}');
--> statement-breakpoint
drop trigger if exists form_submissions_50_guard on public.form_submissions;
--> statement-breakpoint
-- doc §6.3: form_submissions_50_guard.
create trigger form_submissions_50_guard before insert or update or delete on public.form_submissions for each row execute function app.guard_row('{"insert_eq":{"reviewed_at":null,"reviewed_by":null,"submitted_at":null},"client_insert_eq":{"coach_feedback":null,"results":null},"immutable":["id","tenant_id","client_id","form_id","form_version_id","form_kind","calendar_event_id","subscription_id","client_uuid","created_at","submitted_at","reviewed_at","reviewed_by"],"monotonic":["client_updated_at"],"stamp_update":{"updated_at":"now"},"client_update":["answers","missing_required","state","client_updated_at"],"editable_in":[{"column":"state","states":["scheduled","due","overdue"],"cols":["answers","missing_required"]}],"transitions":{"column":"state","insert":["scheduled","due","submitted"],"edges":[["scheduled","due"],["due","overdue"],["due","submitted"],["overdue","submitted"],["submitted","waiting_for_coach"],["submitted","reviewed"],["waiting_for_coach","reviewed"],["scheduled","skipped"],["due","skipped"],["overdue","skipped"],["scheduled","rescheduled"],["due","rescheduled"],["overdue","rescheduled"],["scheduled","cancelled"],["due","cancelled"],["overdue","cancelled"]]},"client_transitions":{"column":"state","insert":["due","submitted"],"edges":[["due","submitted"],["overdue","submitted"]]},"on_transition":{"column":"state","stamps":{"submitted":{"submitted_at":"now"},"reviewed":{"reviewed_at":"now","reviewed_by":"uid"}}}}');
--> statement-breakpoint
drop trigger if exists calendar_events_50_guard on public.calendar_events;
--> statement-breakpoint
-- doc §6.3: calendar_events_50_guard.
create trigger calendar_events_50_guard before insert or update or delete on public.calendar_events for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"completed_at":null,"skipped_at":null,"cancelled_at":null,"source":"manual","rule_key":null},"immutable":["id","tenant_id","client_id","subscription_id","source","rule_key","created_by","created_at","completed_at","skipped_at","cancelled_at"],"stamp_update":{"updated_at":"now"},"client_update":["state"],"client_transitions":{"column":"state","edges":[["scheduled","completed"],["due","completed"],["overdue","completed"],["scheduled","skipped"],["due","skipped"],["overdue","skipped"]]},"on_transition":{"column":"state","stamps":{"scheduled":{"completed_at":"null","skipped_at":"null","cancelled_at":"null"},"due":{"completed_at":"null","skipped_at":"null","cancelled_at":"null"},"overdue":{"completed_at":"null","skipped_at":"null","cancelled_at":"null"},"rescheduled":{"completed_at":"null","skipped_at":"null","cancelled_at":"null"},"completed":{"completed_at":"now","skipped_at":"null","cancelled_at":"null"},"skipped":{"skipped_at":"now","completed_at":"null","cancelled_at":"null"},"cancelled":{"cancelled_at":"now","completed_at":"null","skipped_at":"null"}}}}');
--> statement-breakpoint
drop trigger if exists conversations_50_guard on public.conversations;
--> statement-breakpoint
-- doc §6.3: conversations_50_guard.
create trigger conversations_50_guard before insert or update or delete on public.conversations for each row execute function app.guard_row('{"immutable":["id","tenant_id","kind","client_id","created_at","last_message_at","last_message_preview"],"insert_eq":{"last_message_at":null,"last_message_preview":null,"unread_for_coach":0,"unread_for_client":0},"client_insert_eq":{"kind":"client","subject":null,"archived_at":null},"update_to":{"unread_for_client":0,"unread_for_coach":0},"client_update":["unread_for_client"],"staff_update":["subject","archived_at","unread_for_coach"]}');
--> statement-breakpoint
drop trigger if exists notifications_50_guard on public.notifications;
--> statement-breakpoint
-- doc §6.3: notifications_50_guard.
create trigger notifications_50_guard before insert or update or delete on public.notifications for each row execute function app.guard_row('{"update_allow":["read_at"]}');
--> statement-breakpoint
drop trigger if exists push_subscriptions_50_guard on public.push_subscriptions;
--> statement-breakpoint
-- doc §6.3: push_subscriptions_50_guard.
create trigger push_subscriptions_50_guard before insert or update or delete on public.push_subscriptions for each row execute function app.guard_row('{"immutable":["id","tenant_id","user_id","endpoint","created_at","last_used_at","failed_at"],"update_allow":["keys","user_agent"],"insert_eq":{"last_used_at":null,"failed_at":null}}');
--> statement-breakpoint
drop trigger if exists media_50_guard on public.media;
--> statement-breakpoint
-- doc §6.3: media_50_guard.
create trigger media_50_guard before insert or update or delete on public.media for each row execute function app.guard_row('{"stamp_insert":{"owner_user_id":"uid"},"insert_eq":{"reviewed_by":null,"reviewed_at":null},"client_insert_eq":{"review_note":null},"immutable":["id","tenant_id","client_id","owner_user_id","bucket","path","kind","purpose","created_at","reviewed_by","reviewed_at"],"set_once":["deleted_at"],"client_update":["mime_type","uploaded_at","bytes","width","height","duration_sec","metadata","deleted_at","review_state"],"editable_in":[{"column":"review_state","states":["requested","needs_resubmission"],"cols":["mime_type"]},{"column":"review_state","states":[null,"requested","uploaded","processing","queued_for_review","needs_resubmission","archived"],"cols":["bytes","width","height","duration_sec","metadata","uploaded_at","deleted_at"]}],"transitions":{"column":"review_state","insert":[null,"requested","uploaded"],"edges":[[null,"uploaded"],["requested","uploaded"],["uploaded","processing"],["uploaded","queued_for_review"],["processing","queued_for_review"],["queued_for_review","approved"],["queued_for_review","needs_resubmission"],["queued_for_review","rejected"],["needs_resubmission","uploaded"],["approved","archived"],["rejected","archived"],["needs_resubmission","archived"]]},"client_transitions":{"column":"review_state","insert":[null,"requested","uploaded"],"edges":[[null,"uploaded"],["requested","uploaded"],["uploaded","processing"],["uploaded","queued_for_review"],["processing","queued_for_review"],["needs_resubmission","uploaded"]]},"on_transition":{"column":"review_state","stamps":{"approved":{"reviewed_at":"now","reviewed_by":"uid"},"needs_resubmission":{"reviewed_at":"now","reviewed_by":"uid"},"rejected":{"reviewed_at":"now","reviewed_by":"uid"}}}}');
--> statement-breakpoint

-- doc §7.1.
-- doc §7.1: app.protect_published_version.
create or replace function app.protect_published_version() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  head_col text := tg_argv[0];
  frozen boolean := old.published_at is not null or old.status in ('published', 'superseded');
  bad text;
begin
  if tg_op = 'DELETE' then
    -- Only the erasure path may delete a frozen version, and never as the runtime role.
    if frozen and not (current_user <> 'dawlyy_rls' and coalesce(current_setting('app.erasure', true), '') = 'on') then
      raise exception 'published versions cannot be deleted (version %)', old.id
        using errcode = 'P0001', detail = 'rule:app.protect_published_version', table = tg_table_name;
    end if;
    return old;
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'archived versions cannot be reopened (version %)', old.id
      using errcode = 'P0001', detail = 'rule:app.protect_published_version', table = tg_table_name, column = 'status';
  end if;
  if frozen then
    -- The first column (in this order) that changed is reported as the column at fault.
    select c.col into bad
      from unnest(array['document', 'version_no', 'published_at', 'published_by', 'tenant_id', 'client_id', head_col])
           with ordinality c(col, ord)
     where (to_jsonb(new) -> c.col) is distinct from (to_jsonb(old) -> c.col)
     order by c.ord limit 1;
    if bad is not null then
      raise exception 'published versions are immutable (version %)', old.id
        using errcode = 'P0001', detail = 'rule:app.protect_published_version', table = tg_table_name, column = bad;
    end if;
    if not (new.status = old.status
            or (old.status = 'published' and new.status in ('superseded', 'archived'))
            or (old.status = 'superseded' and new.status = 'archived')) then
      raise exception 'invalid transition from % to % (version %)', old.status, new.status, old.id
        using errcode = 'P0001', detail = 'rule:app.protect_published_version', table = tg_table_name, column = 'status';
    end if;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.protect_published_version() from public;
--> statement-breakpoint
-- The argument is the head column of the versions table.
drop trigger if exists program_versions_protect_published on public.program_versions;
--> statement-breakpoint
drop trigger if exists program_versions_20_protect on public.program_versions;
--> statement-breakpoint
-- doc §7.1: program_versions_20_protect.
create trigger program_versions_20_protect before update or delete on public.program_versions
  for each row execute function app.protect_published_version('program_id');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_protect_published on public.nutrition_plan_versions;
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_20_protect on public.nutrition_plan_versions;
--> statement-breakpoint
-- doc §7.1: nutrition_plan_versions_20_protect.
create trigger nutrition_plan_versions_20_protect before update or delete on public.nutrition_plan_versions
  for each row execute function app.protect_published_version('plan_id');
--> statement-breakpoint
drop trigger if exists form_versions_protect_published on public.form_versions;
--> statement-breakpoint
drop trigger if exists form_versions_20_protect on public.form_versions;
--> statement-breakpoint
-- doc §7.1: form_versions_20_protect.
create trigger form_versions_20_protect before update or delete on public.form_versions
  for each row execute function app.protect_published_version('form_id');
--> statement-breakpoint

-- doc §7.2.
-- doc §7.2: app.version_rules.
create or replace function app.version_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  head_table text := tg_argv[0];
  head_col text := tg_argv[1];
  head_id uuid := (to_jsonb(new) ->> head_col)::uuid;
  h record;
  top integer;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(head_id::text, 0));
  elsif new.status = 'published' and old.status is distinct from 'published' then
    perform pg_advisory_xact_lock(hashtextextended(head_id::text, 0));
  end if;
  if tg_op = 'INSERT' then
    -- Every role: tenant and client always come from the head (no template/copy laundering).
    execute format('select tenant_id, client_id from public.%I where id = $1', head_table) into h using head_id;
    if h is null or h.tenant_id is null then
      raise exception 'document % not found', head_id
        using errcode = '23503', detail = 'rule:app.version_rules', table = tg_table_name, column = head_col;
    end if;
    new.tenant_id := h.tenant_id;
    new.client_id := h.client_id;
  end if;
  if current_user <> 'dawlyy_rls' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    execute format('select max(version_no) from public.%I where %I = $1', tg_table_name, head_col) into top using head_id;
    if top is not null and new.version_no <= top then
      raise exception 'version_no must be greater than % for this document', top
        using errcode = 'P0001', detail = 'rule:app.version_rules', table = tg_table_name, column = 'version_no';
    end if;
  elsif new.status = 'published' and old.status is distinct from 'published' then
    execute format('select max(version_no) from public.%I where %I = $1 and id <> $2 and (published_at is not null or status in (''published'', ''superseded''))',
                   tg_table_name, head_col) into top using head_id, new.id;
    if top is not null and new.version_no <= top then
      raise exception 'version % is older than version % that was already published', new.version_no, top
        using errcode = 'P0001', detail = 'rule:app.version_rules', table = tg_table_name, column = 'version_no';
    end if;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.version_rules() from public;
--> statement-breakpoint
drop trigger if exists program_versions_10_version on public.program_versions;
--> statement-breakpoint
-- doc §7.2: program_versions_10_version.
create trigger program_versions_10_version before insert or update on public.program_versions
  for each row execute function app.version_rules('programs', 'program_id');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_10_version on public.nutrition_plan_versions;
--> statement-breakpoint
-- doc §7.2: nutrition_plan_versions_10_version.
create trigger nutrition_plan_versions_10_version before insert or update on public.nutrition_plan_versions
  for each row execute function app.version_rules('nutrition_plans', 'plan_id');
--> statement-breakpoint
drop trigger if exists form_versions_10_version on public.form_versions;
--> statement-breakpoint
-- doc §7.2: form_versions_10_version.
create trigger form_versions_10_version before insert or update on public.form_versions
  for each row execute function app.version_rules('forms', 'form_id');
--> statement-breakpoint

-- doc §7.3.1.
-- doc §7.3.1: app.head_rules.
create or replace function app.head_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ver_table text := tg_argv[0];
  head_col text := tg_argv[1];
  found_it boolean;
begin
  if tg_op = 'DELETE' then
    if current_user = 'dawlyy_rls' then
      execute format('select exists (select 1 from public.%I where %I = $1 and (status <> ''draft'' or published_at is not null))', ver_table, head_col)
        into found_it using old.id;
      if found_it then
        raise exception 'a document with versions beyond draft cannot be deleted; archive it instead'
          using errcode = 'P0001', detail = 'rule:app.head_rules', table = tg_table_name;
      end if;
    end if;
    return old;
  end if;
  -- published_version_id is maintained by app.version_pointers; the runtime role never writes it.
  if current_user = 'dawlyy_rls' and new.published_version_id is not null
     and (tg_op = 'INSERT' or new.published_version_id is distinct from old.published_version_id) then
    raise exception 'published_version_id is maintained by the database'
      using errcode = '42501', detail = 'rule:app.head_rules', table = tg_table_name, column = 'published_version_id';
  end if;
  if current_user = 'dawlyy_rls' and tg_op = 'UPDATE' and new.published_version_id is null and old.published_version_id is not null then
    raise exception 'published_version_id is maintained by the database'
      using errcode = '42501', detail = 'rule:app.head_rules', table = tg_table_name, column = 'published_version_id';
  end if;
  -- Every role: pointers must name a version of this head.
  if new.published_version_id is not null
     and (tg_op = 'INSERT' or new.published_version_id is distinct from old.published_version_id) then
    execute format('select exists (select 1 from public.%I where id = $1 and %I = $2 and status = ''published'')', ver_table, head_col)
      into found_it using new.published_version_id, new.id;
    if not found_it then
      raise exception 'published_version_id must be a published version of this document'
        using errcode = '23503', detail = 'rule:app.head_rules', table = tg_table_name, column = 'published_version_id';
    end if;
  end if;
  if new.current_version_id is not null
     and (tg_op = 'INSERT' or new.current_version_id is distinct from old.current_version_id) then
    execute format('select exists (select 1 from public.%I where id = $1 and %I = $2)', ver_table, head_col)
      into found_it using new.current_version_id, new.id;
    if not found_it then
      raise exception 'current_version_id must be a version of this document'
        using errcode = '23503', detail = 'rule:app.head_rules', table = tg_table_name, column = 'current_version_id';
    end if;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.head_rules() from public;
--> statement-breakpoint
drop trigger if exists programs_10_head on public.programs;
--> statement-breakpoint
-- doc §7.3.1: programs_10_head.
create trigger programs_10_head before insert or update or delete on public.programs
  for each row execute function app.head_rules('program_versions', 'program_id');
--> statement-breakpoint
drop trigger if exists nutrition_plans_10_head on public.nutrition_plans;
--> statement-breakpoint
-- doc §7.3.1: nutrition_plans_10_head.
create trigger nutrition_plans_10_head before insert or update or delete on public.nutrition_plans
  for each row execute function app.head_rules('nutrition_plan_versions', 'plan_id');
--> statement-breakpoint
drop trigger if exists forms_10_head on public.forms;
--> statement-breakpoint
-- doc §7.3.1: forms_10_head.
create trigger forms_10_head before insert or update or delete on public.forms
  for each row execute function app.head_rules('form_versions', 'form_id');
--> statement-breakpoint

-- doc §7.3.2.
-- doc §7.3.2: app.version_pointers.
create or replace function app.version_pointers() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  head_table text := tg_argv[0];
  head_col text := tg_argv[1];
  head_id uuid;
begin
  if tg_op = 'DELETE' then
    head_id := (to_jsonb(old) ->> head_col)::uuid;
    execute format('update public.%I set current_version_id = null where id = $1 and current_version_id = $2', head_table)
      using head_id, old.id;
    execute format('update public.%I set published_version_id = null where id = $1 and published_version_id = $2', head_table)
      using head_id, old.id;
    return old;
  end if;
  head_id := (to_jsonb(new) ->> head_col)::uuid;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    execute format('update public.%I set published_version_id = $2 where id = $1', head_table) using head_id, new.id;
  elsif tg_op = 'UPDATE' and old.status = 'published' and new.status <> 'published' then
    execute format('update public.%I set published_version_id = null where id = $1 and published_version_id = $2', head_table)
      using head_id, old.id;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.version_pointers() from public;
--> statement-breakpoint
drop trigger if exists program_versions_90_pointers on public.program_versions;
--> statement-breakpoint
-- doc §7.3.2: program_versions_90_pointers.
create trigger program_versions_90_pointers after insert or update of status or delete on public.program_versions
  for each row execute function app.version_pointers('programs', 'program_id');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_90_pointers on public.nutrition_plan_versions;
--> statement-breakpoint
-- doc §7.3.2: nutrition_plan_versions_90_pointers.
create trigger nutrition_plan_versions_90_pointers after insert or update of status or delete on public.nutrition_plan_versions
  for each row execute function app.version_pointers('nutrition_plans', 'plan_id');
--> statement-breakpoint
drop trigger if exists form_versions_90_pointers on public.form_versions;
--> statement-breakpoint
-- doc §7.3.2: form_versions_90_pointers.
create trigger form_versions_90_pointers after insert or update of status or delete on public.form_versions
  for each row execute function app.version_pointers('forms', 'form_id');
--> statement-breakpoint

-- doc §7.4.
-- doc §7.4: app.message_rules.
create or replace function app.message_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  conv_client uuid;
  who text;
  me uuid;
  allowed text[];
  bad text;
begin
  if tg_op = 'INSERT' then
    -- Every role: the message belongs to its conversation's client (null for internal threads).
    -- The lookup runs as the caller, so a conversation the caller cannot see is not found (N12).
    select c.client_id into conv_client from public.conversations c
     where c.id = new.conversation_id and c.tenant_id = new.tenant_id;
    if not found then
      raise exception 'conversation % not found', new.conversation_id
        using errcode = '23503', detail = 'rule:app.message_rules', table = tg_table_name, column = 'conversation_id';
    end if;
    new.client_id := conv_client;
  end if;
  if current_user <> 'dawlyy_rls' then
    return new;
  end if;
  who := app.role();
  me := app.uid();
  if who is null then
    raise exception 'no active membership'
      using errcode = '42501', detail = 'rule:app.message_rules', table = tg_table_name;
  end if;
  if tg_op = 'INSERT' then
    new.sender_user_id := me;
    new.sender_role := who;
    new.created_at := now();
    if new.edited_at is not null or new.deleted_at is not null
       or new.read_by_client_at is not null or new.read_by_coach_at is not null then
      raise exception 'a new message cannot carry edit, delete or read times'
        using errcode = '42501', detail = 'rule:app.message_rules', table = tg_table_name,
              column = case when new.edited_at is not null then 'edited_at'
                            when new.deleted_at is not null then 'deleted_at'
                            when new.read_by_client_at is not null then 'read_by_client_at'
                            else 'read_by_coach_at' end;
    end if;
    return new;
  end if;
  -- UPDATE. The author may edit or delete a message that is not deleted yet; every reader may set their own side's marker.
  allowed := case when old.sender_user_id = me and old.deleted_at is null
                  then array['body', 'attachments', 'deleted_at'] else array[]::text[] end
          || case when who = 'client' then array['read_by_client_at'] else array['read_by_coach_at'] end;
  select string_agg(n.key, ', ' order by n.key) into bad
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key)
     and n.key <> all (allowed)
     and n.key <> 'edited_at';
  if bad is not null then
    raise exception 'messages: % cannot be changed', bad
      using errcode = '42501', detail = 'rule:app.message_rules', table = tg_table_name, column = split_part(bad, ', ', 1);
  end if;
  -- Read markers: set once, stamped by the server.
  if old.read_by_client_at is not null then
    if new.read_by_client_at is null then
      raise exception 'messages: a read marker cannot be cleared'
        using errcode = '42501', detail = 'rule:app.message_rules', table = tg_table_name, column = 'read_by_client_at';
    end if;
    new.read_by_client_at := old.read_by_client_at;
  elsif new.read_by_client_at is not null then
    new.read_by_client_at := now();
  end if;
  if old.read_by_coach_at is not null then
    if new.read_by_coach_at is null then
      raise exception 'messages: a read marker cannot be cleared'
        using errcode = '42501', detail = 'rule:app.message_rules', table = tg_table_name, column = 'read_by_coach_at';
    end if;
    new.read_by_coach_at := old.read_by_coach_at;
  elsif new.read_by_coach_at is not null then
    new.read_by_coach_at := now();
  end if;
  new.edited_at := case
    when new.body is distinct from old.body or new.attachments is distinct from old.attachments then now()
    else old.edited_at
  end;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.message_rules() from public;
--> statement-breakpoint

-- Conversation preview and unread counters follow every new message (clients cannot write them directly).
-- An older message (by created_at) never overwrites the preview or moves last_message_at backwards.
-- doc §7.4: app.on_message_insert.
create or replace function app.on_message_insert() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.conversations c
     set last_message_preview = case
           when c.last_message_at is null or new.created_at >= c.last_message_at then left(coalesce(new.body, ''), 140)
           else c.last_message_preview
         end,
         last_message_at = greatest(coalesce(c.last_message_at, new.created_at), new.created_at),
         unread_for_coach = c.unread_for_coach + case when new.sender_role = 'client' then 1 else 0 end,
         unread_for_client = c.unread_for_client + case when new.sender_role in ('owner', 'staff') then 1 else 0 end
   where c.id = new.conversation_id;
  return null;
end $$;
--> statement-breakpoint
revoke all on function app.on_message_insert() from public;
--> statement-breakpoint

-- After an edit or a delete, the preview shows the newest message that is not deleted.
-- doc §7.4: app.on_message_update.
create or replace function app.on_message_update() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  last_body text;
begin
  select m.body into last_body from public.messages m
   where m.conversation_id = new.conversation_id and m.deleted_at is null
   order by m.created_at desc, m.id desc
   limit 1;
  update public.conversations c
     set last_message_preview = case when found then left(coalesce(last_body, ''), 140) end
   where c.id = new.conversation_id;
  return null;
end $$;
--> statement-breakpoint
revoke all on function app.on_message_update() from public;
--> statement-breakpoint

-- Append-only history of edited messages (table public.message_revisions, §9).
-- doc §7.4: app.message_revision.
create or replace function app.message_revision() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.message_revisions (tenant_id, message_id, client_id, body, attachments, revised_at, revised_by)
  values (old.tenant_id, old.id, old.client_id, old.body, old.attachments, now(), app.uid());
  return null;
end $$;
--> statement-breakpoint
revoke all on function app.message_revision() from public;
--> statement-breakpoint
drop trigger if exists messages_10_message on public.messages;
--> statement-breakpoint
-- doc §7.4: messages_10_message.
create trigger messages_10_message before insert or update on public.messages
  for each row execute function app.message_rules();
--> statement-breakpoint
drop trigger if exists messages_after_insert on public.messages;
--> statement-breakpoint
-- doc §7.4: messages_after_insert.
create trigger messages_after_insert after insert on public.messages
  for each row execute function app.on_message_insert();
--> statement-breakpoint
drop trigger if exists messages_after_update on public.messages;
--> statement-breakpoint
-- doc §7.4: messages_after_update.
create trigger messages_after_update after update of body, deleted_at on public.messages
  for each row when (old.body is distinct from new.body or old.deleted_at is distinct from new.deleted_at)
  execute function app.on_message_update();
--> statement-breakpoint
drop trigger if exists messages_95_revision on public.messages;
--> statement-breakpoint
-- doc §7.4: messages_95_revision.
create trigger messages_95_revision after update of body, attachments on public.messages
  for each row when (old.body is distinct from new.body or old.attachments is distinct from new.attachments)
  execute function app.message_revision();
--> statement-breakpoint

-- doc §7.5.1.
-- doc §7.5.1: app.submission_rules.
create or replace function app.submission_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v record;
begin
  select fv.form_id, fv.status::text as status, f.form_kind, f.client_id, f.tenant_id into v
    from public.form_versions fv
    join public.forms f on f.id = fv.form_id
   where fv.id = new.form_version_id;
  if not found or v.tenant_id <> new.tenant_id then
    raise exception 'form version % not found', new.form_version_id
      using errcode = '23503', detail = 'rule:app.submission_rules', table = tg_table_name, column = 'form_version_id';
  end if;
  if v.client_id is not null and v.client_id <> new.client_id then
    raise exception 'this form belongs to another client'
      using errcode = '42501', detail = 'rule:app.submission_rules', table = tg_table_name, column = 'client_id';
  end if;
  if current_user = 'dawlyy_rls' and v.status not in ('published', 'superseded') then
    raise exception 'only a published form can be answered'
      using errcode = 'P0001', detail = 'rule:app.submission_rules', table = tg_table_name, column = 'form_version_id';
  end if;
  new.form_id := v.form_id;
  new.form_kind := v.form_kind;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.submission_rules() from public;
--> statement-breakpoint
drop trigger if exists form_submissions_10_submission on public.form_submissions;
--> statement-breakpoint
-- doc §7.5.1: form_submissions_10_submission.
create trigger form_submissions_10_submission before insert on public.form_submissions
  for each row execute function app.submission_rules();
--> statement-breakpoint

-- doc §7.5.2.
-- doc §7.5.2: app.advance_due.
create or replace function app.advance_due(p_id uuid) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  s record;
  e record;
  moved boolean := false;
begin
  if tid is null then
    raise exception 'no tenant context' using errcode = '42501', detail = 'rule:app.advance_due';
  end if;
  select fs.client_id, fs.state::text as state, fs.calendar_event_id into s
    from public.form_submissions fs
   where fs.id = p_id and fs.tenant_id = tid
   for update;
  if not found or not app.can_access_client(s.client_id) then
    raise exception 'check-in % not found', p_id
      using errcode = 'P0002', detail = 'rule:app.advance_due', table = 'form_submissions', column = 'id';
  end if;
  select ce.due_at, ce.state::text as state into e
    from public.calendar_events ce
   where ce.id = s.calendar_event_id and ce.tenant_id = tid
   for update;
  if not found or e.due_at is null or e.due_at > now() then
    return false;
  end if;
  if s.state = 'scheduled' then
    update public.form_submissions set state = 'due', updated_at = now()
     where id = p_id and tenant_id = tid and state = 'scheduled';
    moved := found;
  end if;
  if e.state = 'scheduled' then
    update public.calendar_events set state = 'due', updated_at = now()
     where id = s.calendar_event_id and tenant_id = tid and state = 'scheduled' and due_at <= now();
    moved := found or moved;
  end if;
  return moved;
end $$;
--> statement-breakpoint
revoke all on function app.advance_due(uuid) from public;
--> statement-breakpoint

-- doc §7.6.1.
-- doc §7.6.1: app.set_logs_library_check.
create or replace function app.set_logs_library_check() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.exercise_id is not null and (tg_op = 'INSERT' or new.exercise_id is distinct from old.exercise_id)
     and not exists (select 1 from public.exercises e
                      where e.id = new.exercise_id and (e.tenant_id is null or e.tenant_id = new.tenant_id)) then
    raise exception 'exercise_id % is not in this library', new.exercise_id
      using errcode = '23503', detail = 'rule:app.set_logs_library_check', table = tg_table_name, column = 'exercise_id';
  end if;
  if new.substituted_for is not null and (tg_op = 'INSERT' or new.substituted_for is distinct from old.substituted_for)
     and not exists (select 1 from public.exercises e
                      where e.id = new.substituted_for and (e.tenant_id is null or e.tenant_id = new.tenant_id)) then
    raise exception 'substituted_for % is not in this library', new.substituted_for
      using errcode = '23503', detail = 'rule:app.set_logs_library_check', table = tg_table_name, column = 'substituted_for';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.set_logs_library_check() from public;
--> statement-breakpoint

-- doc §7.6.1: app.library_ref_check.
create or replace function app.library_ref_check() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lib text := tg_argv[0];
  col text;
  ref uuid;
  ok boolean;
begin
  for i in 1 .. tg_nargs - 1 loop
    col := tg_argv[i];
    ref := (to_jsonb(new) ->> col)::uuid;
    if ref is not null and (tg_op = 'INSERT' or ref is distinct from (to_jsonb(old) ->> col)::uuid) then
      execute format('select exists (select 1 from public.%I where id = $1 and (tenant_id is null or tenant_id = $2))', lib)
        into ok using ref, new.tenant_id;
      if not ok then
        raise exception '% % is not in this library', col, ref
          using errcode = '23503', detail = 'rule:app.library_ref_check', table = tg_table_name, column = col;
      end if;
    end if;
  end loop;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.library_ref_check() from public;
--> statement-breakpoint
drop trigger if exists set_logs_10_library on public.set_logs;
--> statement-breakpoint
-- doc §7.6.1: set_logs_10_library.
create trigger set_logs_10_library before insert or update on public.set_logs
  for each row execute function app.set_logs_library_check();
--> statement-breakpoint
drop trigger if exists exercises_10_library on public.exercises;
--> statement-breakpoint
-- doc §7.6.1: exercises_10_library.
create trigger exercises_10_library before insert or update on public.exercises
  for each row execute function app.library_ref_check('exercises', 'based_on_id');
--> statement-breakpoint
drop trigger if exists foods_10_library on public.foods;
--> statement-breakpoint
-- doc §7.6.1: foods_10_library.
create trigger foods_10_library before insert or update on public.foods
  for each row execute function app.library_ref_check('foods', 'based_on_id');
--> statement-breakpoint

-- doc §7.6.2.
-- doc §7.6.2: app.exercise_thumbnail_check.
create or replace function app.exercise_thumbnail_check() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.thumbnail_media_id is not null
     and (tg_op = 'INSERT' or new.thumbnail_media_id is distinct from old.thumbnail_media_id)
     and not exists (select 1 from public.media m
                      where m.id = new.thumbnail_media_id and m.tenant_id = new.tenant_id and m.client_id is null
                        and m.purpose in ('exercise_demo', 'branding')) then
    raise exception 'thumbnail_media_id must be a tenant asset (exercise demo or branding)'
      using errcode = '23503', detail = 'rule:app.exercise_thumbnail_check', table = tg_table_name, column = 'thumbnail_media_id';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.exercise_thumbnail_check() from public;
--> statement-breakpoint
drop trigger if exists exercises_10_thumbnail on public.exercises;
--> statement-breakpoint
-- doc §7.6.2: exercises_10_thumbnail.
create trigger exercises_10_thumbnail before insert or update on public.exercises
  for each row execute function app.exercise_thumbnail_check();
--> statement-breakpoint

-- doc §7.6.3.
-- doc §7.6.3: app.template_ref_check.
create or replace function app.template_ref_check() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean;
begin
  if new.template_id is not null and (tg_op = 'INSERT' or new.template_id is distinct from old.template_id) then
    execute format('select exists (select 1 from public.%I where id = $1 and tenant_id = $2 and kind = ''template'' and client_id is null)', tg_table_name)
      into ok using new.template_id, new.tenant_id;
    if not ok then
      raise exception 'template_id % is not a template of this tenant', new.template_id
        using errcode = '23503', detail = 'rule:app.template_ref_check', table = tg_table_name, column = 'template_id';
    end if;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.template_ref_check() from public;
--> statement-breakpoint
drop trigger if exists programs_10_template on public.programs;
--> statement-breakpoint
-- doc §7.6.3: programs_10_template.
create trigger programs_10_template before insert or update on public.programs
  for each row execute function app.template_ref_check();
--> statement-breakpoint
drop trigger if exists nutrition_plans_10_template on public.nutrition_plans;
--> statement-breakpoint
-- doc §7.6.3: nutrition_plans_10_template.
create trigger nutrition_plans_10_template before insert or update on public.nutrition_plans
  for each row execute function app.template_ref_check();
--> statement-breakpoint
drop trigger if exists forms_10_template on public.forms;
--> statement-breakpoint
-- doc §7.6.3: forms_10_template.
create trigger forms_10_template before insert or update on public.forms
  for each row execute function app.template_ref_check();
--> statement-breakpoint

-- doc §7.7.
-- doc §7.7: app.next_client_code.
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
    raise exception 'unknown tenant %', tid
      using errcode = 'P0001', detail = 'rule:app.next_client_code', table = 'tenants', column = 'id';
  end if;
  return prefix || '-' || lpad(n::text, greatest(6, length(n::text)), '0');
end $$;
--> statement-breakpoint
revoke all on function app.next_client_code(uuid) from public;
--> statement-breakpoint

-- clients_90_code, BEFORE INSERT. Runtime inserts must leave code = '' (guard); the code always comes from the counter.
-- doc §7.7: app.assign_client_code.
create or replace function app.assign_client_code() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.code is null or new.code = '' then
    new.code := app.next_client_code(new.tenant_id);
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.assign_client_code() from public;
--> statement-breakpoint

-- doc §7.7: app.next_receipt_no.
create or replace function app.next_receipt_no(tid uuid) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.tenants set receipt_counter = receipt_counter + 1 where id = tid returning receipt_counter into n;
  if n is null then
    raise exception 'unknown tenant %', tid
      using errcode = 'P0001', detail = 'rule:app.next_receipt_no', table = 'tenants', column = 'id';
  end if;
  return 'R-' || lpad(n::text, greatest(6, length(n::text)), '0');
end $$;
--> statement-breakpoint
revoke all on function app.next_receipt_no(uuid) from public;
--> statement-breakpoint

-- payments_90_receipt, BEFORE INSERT OR UPDATE, every role: a payment gets its receipt number when it is verified.
-- doc §7.7: app.payment_receipt.
create or replace function app.payment_receipt() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.state = 'verified' and new.receipt_no is null
     and (tg_op = 'INSERT' or old.state is distinct from 'verified') then
    new.receipt_no := app.next_receipt_no(new.tenant_id);
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.payment_receipt() from public;
--> statement-breakpoint
drop trigger if exists clients_90_code on public.clients;
--> statement-breakpoint
-- doc §7.7: clients_90_code.
create trigger clients_90_code before insert on public.clients
  for each row execute function app.assign_client_code();
--> statement-breakpoint
drop trigger if exists payments_90_receipt on public.payments;
--> statement-breakpoint
-- doc §7.7: payments_90_receipt.
create trigger payments_90_receipt before insert or update on public.payments
  for each row execute function app.payment_receipt();
--> statement-breakpoint

-- doc §7.8.1.
-- doc §7.8.1: app.audit_row.
create or replace function app.audit_row() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  rowj jsonb := to_jsonb(coalesce(new, old));
  strip text[] := case when tg_nargs > 0 then string_to_array(tg_argv[0], ',') else array[]::text[] end;
  tid uuid := coalesce((rowj ->> 'tenant_id')::uuid, case when tg_table_name = 'tenants' then (rowj ->> 'id')::uuid end);
  cid uuid := case when tg_table_name = 'clients' then (rowj ->> 'id')::uuid else (rowj ->> 'client_id')::uuid end;
begin
  insert into public.audit_log (tenant_id, actor_user_id, actor_role, action, entity, entity_id, client_id, before, after, reason)
  values (
    tid,
    app.uid(),
    coalesce(app.role(), case when nullif(current_setting('app.service_reason', true), '') is not null then 'service' end),
    lower(tg_op),
    tg_table_name,
    rowj ->> 'id',
    cid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - strip end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - strip end,
    nullif(current_setting('app.service_reason', true), '')
  );
  return coalesce(new, old);
end $$;
--> statement-breakpoint
revoke all on function app.audit_row() from public;
--> statement-breakpoint

-- doc §7.8.2.
drop trigger if exists clients_audit on public.clients;
--> statement-breakpoint
-- doc §7.8.2: clients_audit.
create trigger clients_audit after insert or update or delete on public.clients for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists client_notes_audit on public.client_notes;
--> statement-breakpoint
-- doc §7.8.2: client_notes_audit.
create trigger client_notes_audit after insert or update or delete on public.client_notes for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists packages_audit on public.packages;
--> statement-breakpoint
-- doc §7.8.2: packages_audit.
create trigger packages_audit after insert or update or delete on public.packages for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists invitations_audit on public.invitations;
--> statement-breakpoint
-- doc §7.8.2: invitations_audit.
create trigger invitations_audit after insert or update or delete on public.invitations for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists consents_audit on public.consents;
--> statement-breakpoint
-- doc §7.8.2: consents_audit.
create trigger consents_audit after insert or update or delete on public.consents for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists programs_audit on public.programs;
--> statement-breakpoint
-- doc §7.8.2: programs_audit.
create trigger programs_audit after insert or update or delete on public.programs for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists nutrition_plans_audit on public.nutrition_plans;
--> statement-breakpoint
-- doc §7.8.2: nutrition_plans_audit.
create trigger nutrition_plans_audit after insert or update or delete on public.nutrition_plans for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists forms_audit on public.forms;
--> statement-breakpoint
-- doc §7.8.2: forms_audit.
create trigger forms_audit after insert or update or delete on public.forms for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists ai_requests_audit on public.ai_requests;
--> statement-breakpoint
-- doc §7.8.2: ai_requests_audit.
create trigger ai_requests_audit after insert or update or delete on public.ai_requests for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists client_flags_audit on public.client_flags;
--> statement-breakpoint
-- doc §7.8.2: client_flags_audit.
create trigger client_flags_audit after insert or update or delete on public.client_flags for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists media_audit on public.media;
--> statement-breakpoint
-- doc §7.8.2: media_audit.
create trigger media_audit after insert or update or delete on public.media for each row execute function app.audit_row();
--> statement-breakpoint

-- doc §7.8.2.
drop trigger if exists program_versions_audit on public.program_versions;
--> statement-breakpoint
-- doc §7.8.2: program_versions_audit.
create trigger program_versions_audit after insert or delete on public.program_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
drop trigger if exists program_versions_audit_update on public.program_versions;
--> statement-breakpoint
-- doc §7.8.2: program_versions_audit_update.
create trigger program_versions_audit_update after update of status, published_at, superseded_at on public.program_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_audit on public.nutrition_plan_versions;
--> statement-breakpoint
-- doc §7.8.2: nutrition_plan_versions_audit.
create trigger nutrition_plan_versions_audit after insert or delete on public.nutrition_plan_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_audit_update on public.nutrition_plan_versions;
--> statement-breakpoint
-- doc §7.8.2: nutrition_plan_versions_audit_update.
create trigger nutrition_plan_versions_audit_update after update of status, published_at, superseded_at on public.nutrition_plan_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
drop trigger if exists form_versions_audit on public.form_versions;
--> statement-breakpoint
-- doc §7.8.2: form_versions_audit.
create trigger form_versions_audit after insert or delete on public.form_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
drop trigger if exists form_versions_audit_update on public.form_versions;
--> statement-breakpoint
-- doc §7.8.2: form_versions_audit_update.
create trigger form_versions_audit_update after update of status, published_at, superseded_at on public.form_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint

-- doc §7.8.2.
drop trigger if exists tenants_audit on public.tenants;
--> statement-breakpoint
-- doc §7.8.2: tenants_audit.
create trigger tenants_audit after insert or delete on public.tenants
  for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists tenants_audit_update on public.tenants;
--> statement-breakpoint
-- doc §7.8.2: tenants_audit_update.
create trigger tenants_audit_update after update of name, slug, client_code_prefix, default_locale, timezone, currency, archived_at on public.tenants
  for each row execute function app.audit_row();
--> statement-breakpoint

-- doc §7.8.4.
-- doc §7.8.4: app.entity_client.
create or replace function app.entity_client(p_entity text, p_id text, p_tenant uuid) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'clients', 'memberships', 'invitations', 'packages', 'subscriptions', 'payments', 'programs', 'program_versions',
    'nutrition_plans', 'nutrition_plan_versions', 'forms', 'form_versions', 'form_submissions', 'calendar_events',
    'workout_sessions', 'conversations', 'messages', 'media', 'tasks', 'client_flags', 'client_notes', 'ai_requests',
    'tenants'];
  rowj jsonb;
begin
  if p_entity is null or p_entity <> all (allowed) then
    raise exception 'entity % is not allowed', p_entity using errcode = '42501', detail = 'rule:app.entity_client';
  end if;
  if p_entity = 'tenants' then
    if p_id is distinct from p_tenant::text then
      raise exception 'tenants % not found', p_id
        using errcode = 'P0002', detail = 'rule:app.entity_client', table = 'tenants', column = 'id';
    end if;
    return null;
  end if;
  begin
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_entity) into rowj using p_id::uuid;
  exception when invalid_text_representation then
    raise exception 'bad entity id %', p_id
      using errcode = '22023', detail = 'rule:app.entity_client', table = p_entity, column = 'id';
  end;
  if rowj is null or (rowj ->> 'tenant_id')::uuid is distinct from p_tenant then
    raise exception '% % not found', p_entity, p_id
      using errcode = 'P0002', detail = 'rule:app.entity_client', table = p_entity, column = 'id';
  end if;
  return case when p_entity = 'clients' then (rowj ->> 'id')::uuid else (rowj ->> 'client_id')::uuid end;
end $$;
--> statement-breakpoint
revoke all on function app.entity_client(text, text, uuid) from public;
--> statement-breakpoint

-- doc §7.8.5.
-- doc §7.8.5: app.audit.
create or replace function app.audit(
  p_action text, p_entity text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null,
  p_reason text default null, p_request_id text default null
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  who text := app.role();
  rule record;
  cid uuid;
begin
  if tid is null then
    raise exception 'no tenant context' using errcode = '42501', detail = 'rule:app.audit';
  end if;
  select a.entity, a.roles into rule from app.audit_actions a where a.action = p_action;
  if not found or rule.entity is distinct from p_entity or not (who = any (rule.roles)) then
    raise exception 'audit action % is not allowed', p_action using errcode = '42501', detail = 'rule:app.audit';
  end if;
  if pg_column_size(p_before) > 65536 or pg_column_size(p_after) > 65536 then
    raise exception 'audit snapshot too large' using errcode = '54000', detail = 'rule:app.audit';
  end if;
  cid := app.entity_client(p_entity, p_entity_id, tid);
  if (cid is null and who = 'client') or (cid is not null and not app.can_access_client(cid)) then
    raise exception 'no access to % %', p_entity, p_entity_id using errcode = '42501', detail = 'rule:app.audit';
  end if;
  insert into public.audit_log (tenant_id, actor_user_id, actor_role, action, entity, entity_id, client_id, before, after, reason, request_id)
  values (tid, app.uid(), who, p_action, p_entity, p_entity_id, cid, p_before, p_after, p_reason, p_request_id);
end $$;
--> statement-breakpoint
revoke all on function app.audit(text, text, text, jsonb, jsonb, text, text) from public;
--> statement-breakpoint

-- Outbox events from the API, in the same transaction as the change. The processor re-reads state (§12) and ignores an
-- event whose recorded actor_role is not in event_types.roles for its type.
-- doc §7.8.5: app.emit_event.
create or replace function app.emit_event(
  p_type text, p_aggregate text, p_aggregate_id text, p_payload jsonb default '{}'::jsonb
) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  who text := app.role();
  rule record;
  cid uuid;
  new_id bigint;
begin
  if tid is null then
    raise exception 'no tenant context' using errcode = '42501', detail = 'rule:app.emit_event';
  end if;
  select e.roles into rule from app.event_types e where e.type = p_type;
  if not found or not (who = any (rule.roles)) then
    raise exception 'event type % is not allowed', p_type using errcode = '42501', detail = 'rule:app.emit_event';
  end if;
  if pg_column_size(p_payload) > 16384 then
    raise exception 'event payload too large' using errcode = '54000', detail = 'rule:app.emit_event';
  end if;
  cid := app.entity_client(p_aggregate, p_aggregate_id, tid);
  if (cid is null and who = 'client') or (cid is not null and not app.can_access_client(cid)) then
    raise exception 'no access to % %', p_aggregate, p_aggregate_id using errcode = '42501', detail = 'rule:app.emit_event';
  end if;
  insert into public.events (tenant_id, type, aggregate, aggregate_id, client_id, payload, actor_user_id, actor_role)
  values (tid, p_type, p_aggregate, p_aggregate_id, cid, coalesce(p_payload, '{}'::jsonb), app.uid(), who)
  returning id into new_id;
  return new_id;
end $$;
--> statement-breakpoint
revoke all on function app.emit_event(text, text, text, jsonb) from public;
--> statement-breakpoint

-- doc §7.9.
-- doc §7.9: app.erase_client.
create or replace function app.erase_client(p_tenant uuid, p_client uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  uids uuid[];
  gone jsonb := '{}'::jsonb;
  n bigint;
begin
  if app.uid() is not null then
    raise exception 'erase_client is service-only' using errcode = '42501', detail = 'rule:app.erase_client';
  end if;
  if not exists (select 1 from public.clients where tenant_id = p_tenant and id = p_client) then
    raise exception 'client not found'
      using errcode = 'P0002', detail = 'rule:app.erase_client', table = 'clients', column = 'id';
  end if;
  perform set_config('app.erasure', 'on', true);
  select coalesce(array_agg(distinct m.user_id), array[]::uuid[]) into uids
    from public.memberships m
   where m.tenant_id = p_tenant and m.client_id = p_client;
  delete from public.notifications where tenant_id = p_tenant and user_id = any(uids);
  delete from public.push_subscriptions where tenant_id = p_tenant and user_id = any(uids);
  delete from public.user_preferences where tenant_id = p_tenant and user_id = any(uids);
  delete from public.idempotency_keys where tenant_id = p_tenant and user_id = any(uids);
  delete from public.staff_client_assignments where tenant_id = p_tenant and client_id = p_client;
  delete from public.memberships where tenant_id = p_tenant and client_id = p_client;
  delete from public.clients where tenant_id = p_tenant and id = p_client;
  delete from public.audit_log
   where tenant_id = p_tenant and (client_id = p_client or (entity = 'clients' and entity_id = p_client::text));
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('audit_log', n);
  delete from public.events
   where tenant_id = p_tenant and (client_id = p_client or (aggregate = 'clients' and aggregate_id = p_client::text));
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('events', n);
  insert into public.audit_log (tenant_id, actor_role, action, entity, entity_id, after, reason)
  values (p_tenant, 'service', 'client.erase', 'clients', p_client::text,
          jsonb_build_object('deleted', gone), nullif(current_setting('app.service_reason', true), ''));
  return gone;
end $$;
--> statement-breakpoint
revoke all on function app.erase_client(uuid, uuid) from public;
--> statement-breakpoint

-- doc §7.9: app.close_tenant.
create or replace function app.close_tenant(p_tenant uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  gone jsonb := '{}'::jsonb;
  n bigint;
begin
  if app.uid() is not null then
    raise exception 'close_tenant is service-only' using errcode = '42501', detail = 'rule:app.close_tenant';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'tenant not found'
      using errcode = 'P0002', detail = 'rule:app.close_tenant', table = 'tenants', column = 'id';
  end if;
  perform set_config('app.erasure', 'on', true);
  delete from public.tenants where id = p_tenant;
  delete from public.idempotency_keys where tenant_id = p_tenant;
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('idempotency_keys', n);
  delete from public.job_runs where tenant_id = p_tenant;
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('job_runs', n);
  delete from public.audit_log where tenant_id = p_tenant;
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('audit_log', n);
  delete from public.events where tenant_id = p_tenant;
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('events', n);
  return gone;
end $$;
--> statement-breakpoint
revoke all on function app.close_tenant(uuid) from public;
--> statement-breakpoint

-- doc §7.10.1.
-- doc §7.10.1: app.keep_one_owner.
create or replace function app.keep_one_owner() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
begin
  if current_user <> 'dawlyy_rls' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    perform pg_advisory_xact_lock(hashtextextended('owners:' || old.tenant_id::text, 0));
    if not exists (select 1 from public.memberships m
                    where m.tenant_id = old.tenant_id and m.role = 'owner' and m.status = 'active' and m.id <> old.id) then
      -- The column at fault is the one that stops the owner being an active owner; a delete names no column.
      col := case when tg_op = 'DELETE' then null when new.role <> 'owner' then 'role' else 'status' end;
      raise exception 'a tenant must keep at least one active owner'
        using errcode = 'P0001', detail = 'rule:app.keep_one_owner', table = tg_table_name, column = coalesce(col, '');
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
--> statement-breakpoint
revoke all on function app.keep_one_owner() from public;
--> statement-breakpoint
drop trigger if exists memberships_40_owner on public.memberships;
--> statement-breakpoint
-- doc §7.10.1: memberships_40_owner.
create trigger memberships_40_owner before update or delete on public.memberships
  for each row execute function app.keep_one_owner();
--> statement-breakpoint

-- doc §7.10.2.
-- doc §7.10.2: app.team_directory.
create or replace function app.team_directory() returns table (user_id uuid, role text, display_name text)
language sql stable security definer
set search_path = ''
as $$
  select m.user_id, m.role::text, m.display_name
    from public.memberships m
   where m.tenant_id = (select t.tenant_id from app.membership() t)
     and m.role in ('owner', 'staff')
     and m.status = 'active'
$$;
--> statement-breakpoint
revoke all on function app.team_directory() from public;
--> statement-breakpoint

-- doc §7.10.3.
-- doc §7.10.3: app.register_push.
create or replace function app.register_push(p_endpoint text, p_keys jsonb, p_ua text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  uid uuid := app.uid();
  sub_id uuid;
begin
  if tid is null or uid is null then
    raise exception 'no tenant context' using errcode = '42501', detail = 'rule:app.register_push';
  end if;
  if p_endpoint is null or length(p_endpoint) > 2048 or p_endpoint !~ '^https://[^/@]+/' then
    raise exception 'invalid push endpoint'
      using errcode = '22023', detail = 'rule:app.register_push', table = 'push_subscriptions', column = 'endpoint';
  end if;
  if jsonb_typeof(p_keys) is distinct from 'object' or not (p_keys ? 'p256dh' and p_keys ? 'auth') then
    raise exception 'invalid push keys'
      using errcode = '22023', detail = 'rule:app.register_push', table = 'push_subscriptions', column = 'keys';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('push:' || p_endpoint, 0));
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> uid;
  insert into public.push_subscriptions (tenant_id, user_id, endpoint, keys, user_agent)
  values (tid, uid, p_endpoint, p_keys, left(p_ua, 512))
  on conflict (tenant_id, endpoint) do update
    set keys = excluded.keys, user_agent = excluded.user_agent, failed_at = null
  returning id into sub_id;
  return sub_id;
end $$;
--> statement-breakpoint
revoke all on function app.register_push(text, jsonb, text) from public;
--> statement-breakpoint

-- doc §7.10.4.
-- doc §7.10.4: app.assign_creator.
create or replace function app.assign_creator() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  m record;
begin
  select * into m from app.membership();
  if m.role = 'staff' and m.tenant_id = new.tenant_id
     and coalesce(m.permissions ->> 'client_scope', 'assigned') = 'assigned' then
    insert into public.staff_client_assignments (tenant_id, membership_id, client_id, assigned_by)
    values (new.tenant_id, m.membership_id, new.id, app.uid())
    on conflict do nothing;
  end if;
  return null;
end $$;
--> statement-breakpoint
revoke all on function app.assign_creator() from public;
--> statement-breakpoint
drop trigger if exists clients_80_assign_creator on public.clients;
--> statement-breakpoint
-- doc §7.10.4: clients_80_assign_creator.
create trigger clients_80_assign_creator after insert on public.clients
  for each row execute function app.assign_creator();
--> statement-breakpoint

-- doc §7.11.1.
-- doc §7.11.1: app.visible_refs.
create or replace function app.visible_refs() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean := true;
begin
  if current_user <> 'dawlyy_rls' then
    return new;
  end if;
  if tg_table_name = 'workout_sessions' then
    if new.program_version_id is not null
       and (tg_op = 'INSERT' or new.program_version_id is distinct from old.program_version_id) then
      ok := exists (select 1 from public.program_versions v where v.id = new.program_version_id);
    end if;
  elsif new.plan_version_id is not null
        and (tg_op = 'INSERT' or new.plan_version_id is distinct from old.plan_version_id) then
    ok := exists (select 1 from public.nutrition_plan_versions v where v.id = new.plan_version_id);
  end if;
  if not ok then
    raise exception '%: the referenced version is not visible to you', tg_table_name
      using errcode = '23503', detail = 'rule:app.visible_refs', table = tg_table_name,
            column = case when tg_table_name = 'workout_sessions' then 'program_version_id' else 'plan_version_id' end;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.visible_refs() from public;
--> statement-breakpoint
drop trigger if exists workout_sessions_10_refs on public.workout_sessions;
--> statement-breakpoint
-- doc §7.11.1: workout_sessions_10_refs.
create trigger workout_sessions_10_refs before insert or update on public.workout_sessions
  for each row execute function app.visible_refs();
--> statement-breakpoint
drop trigger if exists meal_logs_10_refs on public.meal_logs;
--> statement-breakpoint
-- doc §7.11.1: meal_logs_10_refs.
create trigger meal_logs_10_refs before insert or update on public.meal_logs
  for each row execute function app.visible_refs();
--> statement-breakpoint
drop trigger if exists supplement_logs_10_refs on public.supplement_logs;
--> statement-breakpoint
-- doc §7.11.1: supplement_logs_10_refs.
create trigger supplement_logs_10_refs before insert or update on public.supplement_logs
  for each row execute function app.visible_refs();
--> statement-breakpoint

-- doc §7.11.2.
-- doc §7.11.2: app.task_assignee_check.
create or replace function app.task_assignee_check() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.assignee_membership_id is not null
     and (tg_op = 'INSERT' or new.assignee_membership_id is distinct from old.assignee_membership_id)
     and not exists (select 1 from public.memberships m
                      where m.id = new.assignee_membership_id and m.tenant_id = new.tenant_id
                        and m.role in ('owner', 'staff') and m.status = 'active') then
    raise exception 'tasks: the assignee must be an active owner or staff member'
      using errcode = '23503', detail = 'rule:app.task_assignee_check', table = tg_table_name, column = 'assignee_membership_id';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.task_assignee_check() from public;
--> statement-breakpoint
drop trigger if exists tasks_20_assignee on public.tasks;
--> statement-breakpoint
-- doc §7.11.2: tasks_20_assignee.
create trigger tasks_20_assignee before insert or update of assignee_membership_id on public.tasks
  for each row execute function app.task_assignee_check();
--> statement-breakpoint

-- doc §7.11.3.
-- doc §7.11.3: app.media_proof_rules.
create or replace function app.media_proof_rules() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null
     and exists (select 1 from public.payments p where p.proof_media_id = old.id and p.state <> 'pending') then
    raise exception 'media: the proof of a payment that is no longer pending cannot be deleted'
      using errcode = 'P0001', detail = 'rule:app.media_proof_rules', table = tg_table_name, column = 'deleted_at';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.media_proof_rules() from public;
--> statement-breakpoint
drop trigger if exists media_20_proof on public.media;
--> statement-breakpoint
-- doc §7.11.3: media_20_proof.
create trigger media_20_proof before update of deleted_at on public.media
  for each row execute function app.media_proof_rules();
--> statement-breakpoint

-- doc §7.11.4.
-- doc §7.11.4: app.payment_refund_permission.
create or replace function app.payment_refund_permission() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'dawlyy_rls' and app.role() = 'staff'
     and new.refund_amount is distinct from old.refund_amount
     and not app.has_perm('billing', 'verify') then
    raise exception 'refund changes require billing verify'
      using errcode = '42501', detail = 'rule:app.payment_refund_permission',
            table = tg_table_name, column = 'refund_amount';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.payment_refund_permission() from public;
--> statement-breakpoint
drop trigger if exists payments_60_refund_perm on public.payments;
--> statement-breakpoint
-- doc §7.11.4: payments_60_refund_perm.
create trigger payments_60_refund_perm before update of refund_amount on public.payments
  for each row execute function app.payment_refund_permission();
--> statement-breakpoint

-- doc §11.4: final privileges block, verbatim.
-- 1. Supabase-facing roles get nothing on DAWLYY objects, now or in future. Skipped for roles that do not exist.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all tables in schema app from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all sequences in schema app from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all functions in schema app from %I', r);
      execute format('revoke all on schema app from %I', r);
      execute format('alter default privileges for role postgres in schema public revoke all on tables from %I', r);
      execute format('alter default privileges for role postgres in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges for role postgres in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;
--> statement-breakpoint
-- 2. Best effort (PRIV-02): drop the runtime login's membership in `authenticated` when the migration role may. On
--    Supabase it may not (PG16+ needs ADMIN OPTION). Then the guarantee rests on `authenticated` holding no privilege
--    on any DAWLYY object, which step 1 and C05 enforce. This statement never fails the migration.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and pg_has_role('dawlyy_app', 'authenticated', 'member') then
    if exists (select 1 from pg_auth_members where roleid = 'authenticated'::regrole and member = current_user::regrole and admin_option) then
      begin
        execute 'revoke authenticated from dawlyy_app';
      exception when insufficient_privilege then
        raise warning 'could not revoke authenticated from dawlyy_app (%); relying on authenticated holding no privilege', sqlerrm;
      end;
    else
      raise warning 'no ADMIN OPTION on authenticated: dawlyy_app stays a member; relying on authenticated holding no privilege';
    end if;
  end if;
end $$;
--> statement-breakpoint
-- 3. PUBLIC and the runtime login hold nothing, and nobody creates objects in the two schemas.
revoke all on all tables in schema public from public, dawlyy_app;
--> statement-breakpoint
revoke all on all sequences in schema public from public, dawlyy_app, dawlyy_rls;
--> statement-breakpoint
revoke all on all functions in schema app from public, dawlyy_app, dawlyy_rls;
--> statement-breakpoint
revoke create on schema public, app from public, dawlyy_app, dawlyy_rls;
--> statement-breakpoint
-- 4. Runtime role, tables (§3.3): SELECT everywhere (RLS filters rows), writes only where listed.
revoke all on all tables in schema public from dawlyy_rls;
--> statement-breakpoint
grant select on all tables in schema public to dawlyy_rls;
--> statement-breakpoint
grant insert, update on
  memberships, invitations, business_settings, user_preferences, consents, clients, client_notes, client_flags,
  tasks, ai_requests, packages, subscriptions, client_entitlement_overrides, payments, exercises, foods,
  programs, program_versions, nutrition_plans, nutrition_plan_versions, forms, form_versions, form_submissions,
  calendar_events, measurement_sets, progress_photo_sets, inbody_records, workout_sessions,
  set_logs, meal_logs, supplement_logs, conversations, messages, push_subscriptions, media
to dawlyy_rls;
--> statement-breakpoint
grant update on tenants, notifications to dawlyy_rls;
--> statement-breakpoint
grant insert on staff_client_assignments, subscription_events, tenant_hidden_items, idempotency_keys, metric_entries
to dawlyy_rls;
--> statement-breakpoint
grant delete on
  staff_client_assignments, invitations, user_preferences, client_notes, tasks, packages, tenant_hidden_items,
  programs, program_versions, nutrition_plans, nutrition_plan_versions, forms, form_versions, notifications,
  push_subscriptions, idempotency_keys, media
to dawlyy_rls;
--> statement-breakpoint
-- 5. Runtime role, functions (§3.4): the whole EXECUTE set, in one statement, after every create function.
grant execute on function
  app.uid(), app.membership(), app.membership_id(), app.tenant_id(), app.role(), app.client_id(),
  app.is_staff(), app.is_owner(), app.is_client(), app.sees_all_clients(),
  app.assigned_client_ids(), app.accessible_user_ids(),
  app.can_access_client(uuid), app.can_access_user(uuid), app.has_perm(text, text),
  app.guard_resolve(jsonb, text),
  app.audit(text, text, text, jsonb, jsonb, text, text), app.emit_event(text, text, text, jsonb),
  app.register_push(text, jsonb, text), app.advance_due(uuid), app.team_directory()
to dawlyy_rls;
--> statement-breakpoint
