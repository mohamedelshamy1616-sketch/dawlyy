-- N2: endpoint handover is limited to the caller's pinned tenant. Applied migrations stay immutable.
set check_function_bodies = on;
--> statement-breakpoint
alter default privileges revoke execute on functions from public;
--> statement-breakpoint
-- doc §7.10.3: app.register_push, with the N2 tenant isolation correction.
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
  delete from public.push_subscriptions where tenant_id = tid and endpoint = p_endpoint and user_id <> uid;
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
grant execute on function app.register_push(text, jsonb, text) to dawlyy_rls;
--> statement-breakpoint
