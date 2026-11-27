-- Run on a test database after migrations 0001–0005. Fixtures roll back at the end.
begin;

do $$
declare
  first_member uuid := gen_random_uuid();
  second_member uuid := gen_random_uuid();
  other_member uuid := gen_random_uuid();
  target text := '9999-2026-004521';
  other_target text := '9999-2026-004522';
  recorded record;
  check_one timestamptz := '2026-11-25T09:00:00+09:00';
  check_two timestamptz := '2026-11-25T10:00:00+09:00';
  check_three timestamptz := '2026-11-25T11:00:00+09:00';
  check_four timestamptz := '2026-11-25T12:00:00+09:00';
  application jsonb := '{"2026-11-25:42":{"receiptDate":"2026-11-25","receiptNo":"42","status":"received"}}';
  receipt jsonb := '[{"event_key":"2026-11-25:42:received","kind":"received"}]';
  completion jsonb := '[{"event_key":"2026-11-25:42:completed","kind":"completed"}]';
begin
  insert into auth.users (id) values (first_member), (second_member), (other_member);
  insert into public.properties (id, registry_unique_no, location_name, address, property_type, building_name, unit_name)
  values ('monitor-sample-301', target, '검수 대상', '검수 주소', '집합건물', '검수 건물', '301호');
  insert into public.watchlists (user_id, target_id) values
    (first_member, 'monitor-sample-301'), (first_member, 'iros:' || target),
    (second_member, 'iros:' || replace(target, '-', '')), (other_member, other_target);

  select * into strict recorded from public.monitor_admin_targets(target, null, 10);
  if recorded.subscriber_count <> 2 or recorded.location_label <> '검수 주소 301호' then
    raise exception 'Canonical UID aggregation or address failed';
  end if;

  if has_function_privilege('authenticated', 'public.commit_manual_registry_check(text,bigint,timestamptz,text,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.monitor_admin_targets(text,text,integer)', 'EXECUTE')
     or has_table_privilege('authenticated', 'public.monitor_states', 'SELECT')
     or has_column_privilege('authenticated', 'public.notifications', 'event_id', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.notifications', 'read', 'UPDATE') then
    raise exception 'Monitoring permissions are too broad or block read receipts';
  end if;

  select * into strict recorded from public.commit_manual_registry_check(target, 0, check_one, 'ok', '{}', '[]');
  if recorded.outcome <> 'applied' or recorded.events_created <> 0 or recorded.notifications_created <> 0 then
    raise exception 'Baseline sent a notification';
  end if;

  select * into strict recorded from public.commit_manual_registry_check(target, 0, check_two, 'ok', application, receipt);
  if recorded.outcome <> 'conflict' then raise exception 'Outdated revision was accepted'; end if;

  begin
    perform public.commit_manual_registry_check(target, 1, check_two, 'invalid_status', application, receipt);
    raise exception 'An invalid snapshot was accepted';
  exception when check_violation then
    if exists (select 1 from public.change_events where property_id = target)
       or exists (select 1 from public.notifications where property_id = target)
       or (select revision from public.monitor_states where property_uid = target) <> 1 then
      raise exception 'A failed commit left partial data';
    end if;
  end;

  select * into strict recorded from public.commit_manual_registry_check(target, 1, check_two, 'ok', application, receipt);
  if recorded.outcome <> 'applied' or recorded.events_created <> 1 or recorded.notifications_created <> 2
     or not exists (select 1 from public.notifications where user_id = first_member and property_id = target)
     or not exists (select 1 from public.notifications where user_id = second_member and property_id = target) then
    raise exception 'One event must notify both members once';
  end if;

  select * into strict recorded from public.commit_manual_registry_check(target, 2, check_two, 'ok', application, receipt);
  if recorded.events_created <> 0 or recorded.notifications_created <> 0 then raise exception 'Duplicate delivery'; end if;

  select * into strict recorded from public.commit_manual_registry_check(target, 3, check_three, 'auth_required', '{}', '[]');
  if recorded.outcome <> 'applied' or not exists (
    select 1 from public.monitor_states where property_uid = target and last_success_at = check_two
      and last_attempt_at = check_three and last_status = 'auth_required' and known_applications = application
  ) then raise exception 'A failed lookup replaced a good snapshot'; end if;

  select * into strict recorded from public.commit_manual_registry_check(target, 4, check_one, 'ok', '{}', '[]');
  if recorded.outcome <> 'stale' then raise exception 'A stale lookup was applied'; end if;

  perform set_config('request.jwt.claim.sub', other_member::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', other_member)::text, true);
  if exists (select 1 from public.monitor_my_watch_status()) then raise exception 'Another member can see the state'; end if;

  delete from public.watchlists where user_id = second_member;
  select * into strict recorded from public.commit_manual_registry_check(
    target, 4, check_four, 'ok', jsonb_set(application, '{2026-11-25:42,status}', '"completed"'), completion
  );
  if recorded.notifications_created <> 1 or exists (
    select 1 from public.notifications where user_id = second_member and property_id = target and kind = 'completed'
  ) then raise exception 'Removed subscriptions received completion'; end if;

  perform set_config('request.jwt.claim.sub', first_member::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', first_member)::text, true);
  if (select count(*) from public.monitor_my_watch_status() where has_completed_event and not has_open_application) <> 2 then
    raise exception 'The completion status is missing from an active subscription';
  end if;
end;
$$;

rollback;
