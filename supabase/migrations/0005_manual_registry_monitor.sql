-- Restrict monitoring writes to the trusted server and publish only per-member summaries.

alter table public.monitor_states add column revision bigint not null default 0;

drop policy if exists "monitor_states_auth_select" on public.monitor_states;
drop policy if exists "monitor_states_auth_upsert" on public.monitor_states;
drop policy if exists "monitor_states_auth_update" on public.monitor_states;
drop policy if exists "events_auth_insert" on public.change_events;
drop policy if exists "events_public_read" on public.change_events;
drop policy if exists "notifications_owner_insert" on public.notifications;
revoke all on public.monitor_states from public, anon, authenticated;
revoke all on public.change_events from public, anon, authenticated;
revoke insert, update, delete on public.notifications from public, anon, authenticated;
grant update (read) on public.notifications to authenticated;
grant select on public.monitor_states to service_role;

with duplicates as (
  select id, row_number() over (partition by user_id, event_id order by read desc, created_at, id) as position
  from public.notifications
  where event_id is not null
)
delete from public.notifications n using duplicates d where n.id = d.id and d.position > 1;

create unique index monitor_notification_per_member_event
  on public.notifications (user_id, event_id);

create function public.monitor_property_uid(value text)
returns text
language sql immutable strict
set search_path = ''
as $$
  select case when btrim(value) ~ '^(iros:)?([0-9]{14}|[0-9]{4}[- ][0-9]{4}[- ][0-9]{6})$'
    then regexp_replace(regexp_replace(value, '[^0-9]', '', 'g'), '^(.{4})(.{4})(.{6})$', '\1-\2-\3')
    end;
$$;

create view public.monitor_watch_subscriptions as
select w.user_id, w.target_id, w.created_at,
       coalesce(public.monitor_property_uid(w.target_id), public.monitor_property_uid(p.registry_unique_no)) as property_uid,
       nullif(concat_ws(' ', p.address, nullif(p.unit_name, '')), '') as location_label
from public.watchlists w
left join public.properties p on p.id = w.target_id;

revoke all on public.monitor_watch_subscriptions from public, anon, authenticated;

create function public.monitor_admin_targets(p_query text, p_after text, p_limit integer)
returns table (property_uid text, location_label text, subscriber_count bigint,
               last_attempt_at timestamptz, last_success_at timestamptz, last_status text)
language sql stable security definer
set search_path = ''
as $$
  select w.property_uid, min(w.location_label), count(distinct w.user_id),
         s.last_attempt_at, s.last_success_at, s.last_status
  from public.monitor_watch_subscriptions w
  left join public.monitor_states s on s.property_uid = w.property_uid and s.revision > 0
  where w.property_uid > coalesce(p_after, '')
  group by w.property_uid, s.last_attempt_at, s.last_success_at, s.last_status
  having coalesce(p_query, '') = ''
     or strpos(replace(w.property_uid, '-', ''), replace(p_query, '-', '')) > 0
     or bool_or(strpos(lower(w.location_label), lower(p_query)) > 0)
  order by w.property_uid
  limit least(greatest(p_limit, 1), 101);
$$;

create function public.monitor_my_watch_status()
returns table (target_id text, property_uid text, last_attempt_at timestamptz, last_success_at timestamptz,
               last_status text, has_open_application boolean, has_completed_event boolean)
language sql stable security definer
set search_path = ''
as $$
  select w.target_id, w.property_uid, s.last_attempt_at, s.last_success_at, s.last_status,
         exists (
           select 1 from jsonb_each(s.known_applications) a
           where a.value->>'status' in ('received', 'in_progress', 'correction')
         ),
         exists (
           select 1 from public.notifications n
           join public.change_events e on e.id = n.event_id
           where n.user_id = w.user_id and n.property_id = w.property_uid
             and n.kind = 'completed' and e.provider = 'iros-manual' and n.created_at >= w.created_at
         )
  from public.monitor_watch_subscriptions w
  join public.monitor_states s on s.property_uid = w.property_uid and s.revision > 0
  where w.user_id = auth.uid();
$$;

create function public.commit_manual_registry_check(
  p_property_uid text, p_revision bigint, p_checked_at timestamptz, p_status text,
  p_known_applications jsonb, p_events jsonb
)
returns table (outcome text, events_created bigint, notifications_created bigint)
language plpgsql security definer
set search_path = ''
as $$
declare
  snapshot public.monitor_states%rowtype;
  event_count bigint;
  notification_count bigint;
begin
  if not exists (select 1 from public.monitor_watch_subscriptions w where w.property_uid = p_property_uid) then
    return query select 'not_watched'::text, 0::bigint, 0::bigint;
    return;
  end if;

  insert into public.monitor_states (property_uid) values (p_property_uid) on conflict do nothing;
  select * into strict snapshot from public.monitor_states s where s.property_uid = p_property_uid for update;

  if snapshot.revision > 0 and p_checked_at < snapshot.last_attempt_at then
    return query select 'stale'::text, 0::bigint, 0::bigint;
    return;
  end if;
  if snapshot.revision <> p_revision then
    return query select 'conflict'::text, 0::bigint, 0::bigint;
    return;
  end if;

  with new_events as (
    insert into public.change_events (property_id, external_event_key, kind, provider, observed_at)
    select p_property_uid, 'iros-manual:' || event.event_key, event.kind, 'iros-manual', p_checked_at
    from jsonb_to_recordset(p_events) as event(event_key text, kind text)
    on conflict (property_id, external_event_key, kind) do nothing
    returning id, kind
  ), delivered as (
    insert into public.notifications (user_id, property_id, event_id, kind)
    select distinct w.user_id, p_property_uid, e.id, e.kind
    from new_events e
    join public.monitor_watch_subscriptions w on w.property_uid = p_property_uid
    on conflict (user_id, event_id) do nothing
    returning id
  )
  select (select count(*) from new_events), (select count(*) from delivered)
    into event_count, notification_count;

  update public.monitor_states s
  set revision = s.revision + 1,
      last_attempt_at = p_checked_at,
      last_success_at = case when p_status = 'ok' then p_checked_at when s.revision > 0 then s.last_success_at end,
      last_status = p_status,
      known_applications = case when p_status = 'ok' then p_known_applications
                                when s.revision > 0 then s.known_applications else '{}'::jsonb end,
      provider = 'iros-manual',
      updated_at = now()
  where s.property_uid = p_property_uid;

  return query select 'applied'::text, event_count, notification_count;
end;
$$;

revoke execute on function public.monitor_admin_targets(text, text, integer) from public, anon, authenticated;
revoke execute on function public.commit_manual_registry_check(text, bigint, timestamptz, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.monitor_my_watch_status() from public, anon;
grant execute on function public.monitor_admin_targets(text, text, integer) to service_role;
grant execute on function public.commit_manual_registry_check(text, bigint, timestamptz, text, jsonb, jsonb) to service_role;
grant execute on function public.monitor_my_watch_status() to authenticated;
