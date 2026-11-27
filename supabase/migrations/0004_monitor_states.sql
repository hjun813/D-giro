-- 0004: 고유번호 기준 모니터링 스냅샷 상태 테이블 및 차등 폴링 티어

create table if not exists public.monitor_states (
  property_uid text primary key,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_status text check (last_status in ('ok', 'failed', 'rate_limited', 'auth_required')),
  known_applications jsonb not null default '{}'::jsonb,
  provider text not null default 'mock',
  updated_at timestamptz not null default now()
);

create index if not exists idx_monitor_states_status
  on public.monitor_states (last_status, last_success_at);

alter table public.watchlists
  add column if not exists poll_tier text not null default 'standard'
    check (poll_tier in ('standard', 'intensive'));

alter table public.monitor_states enable row level security;

drop policy if exists "monitor_states_auth_select" on public.monitor_states;
create policy "monitor_states_auth_select" on public.monitor_states
  for select to authenticated using (true);

drop policy if exists "monitor_states_auth_upsert" on public.monitor_states;
create policy "monitor_states_auth_upsert" on public.monitor_states
  for insert to authenticated with check (true);

drop policy if exists "monitor_states_auth_update" on public.monitor_states;
create policy "monitor_states_auth_update" on public.monitor_states
  for update to authenticated using (true) with check (true);
