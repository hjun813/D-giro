-- 등기로 (Deunggiro) Supabase PostgreSQL 초기 스키마
-- Supabase Dashboard > SQL Editor에서 실행하거나 `supabase db push`로 적용하세요.

create extension if not exists pgcrypto;

-- 1. 부동산 등기 대상 (검증된 고유번호 또는 필지 PNU 기준)
create table if not exists public.properties (
  id text primary key,
  pnu text,
  registry_unique_no text unique,
  location_name text not null,
  address text not null,
  property_type text not null check (property_type in ('집합건물', '건물', '토지')),
  building_name text not null,
  unit_name text,
  area_text text,
  structure text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create index if not exists idx_properties_pnu on public.properties (pnu);

-- 2. 공유 등기 자료 (원본 파일은 Private Storage에 격리하고 추출·마스킹된 요약만 저장)
create table if not exists public.registry_documents (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  file_sha256 text not null,
  storage_path text,
  status text not null default 'published' check (status in ('published', 'review', 'mismatch', 'unreadable', 'duplicate')),
  issued_at timestamptz,
  owner_masked text,
  ownership_cause text,
  mortgage_amount bigint,
  creditor text,
  rank_label text,
  reflected_event_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_registry_documents_property on public.registry_documents (property_id, issued_at desc);

-- 3. 등기변동 사건 이력 (고유번호별 1건 기록, 조회 실패와 구분)
create table if not exists public.change_events (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,
  external_event_key text not null,
  kind text not null check (kind in ('received', 'completed')),
  provider text not null default 'mock',
  observed_at timestamptz not null default now(),
  unique (property_id, external_event_key, kind)
);

-- 4. 회원별 관심 부동산 목록
create table if not exists public.watchlists (
  user_id uuid not null references auth.users (id) on delete cascade,
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id)
);

create index if not exists idx_watchlists_target on public.watchlists (target_id);

-- 5. 서비스 내 등기변동 알림
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  property_id text not null,
  event_id uuid references public.change_events (id) on delete cascade,
  kind text not null check (kind in ('received', 'completed')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications (user_id, read, created_at desc);

-- Row Level Security (RLS) 활성화
alter table public.properties enable row level security;
alter table public.registry_documents enable row level security;
alter table public.change_events enable row level security;
alter table public.watchlists enable row level security;
alter table public.notifications enable row level security;

-- 공개 조회 정책 (허용된 공유 자료만 읽기 가능)
drop policy if exists "properties_public_read" on public.properties;
create policy "properties_public_read" on public.properties
  for select using (true);

drop policy if exists "documents_published_read" on public.registry_documents;
create policy "documents_published_read" on public.registry_documents
  for select using (status = 'published' or auth.uid() = uploaded_by);

drop policy if exists "documents_auth_insert" on public.registry_documents;
create policy "documents_auth_insert" on public.registry_documents
  for insert with check (auth.uid() = uploaded_by);

drop policy if exists "events_public_read" on public.change_events;
create policy "events_public_read" on public.change_events
  for select using (true);

-- 관심 목록: 본인 데이터만 조회/추가/삭제
drop policy if exists "watchlists_owner_all" on public.watchlists;
create policy "watchlists_owner_all" on public.watchlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 알림: 본인 알림만 조회/읽음 수정
drop policy if exists "notifications_owner_select" on public.notifications;
create policy "notifications_owner_select" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_owner_update" on public.notifications;
create policy "notifications_owner_update" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 원본 등기 파일용 Private Storage 버킷 (공개 URL 차단)
insert into storage.buckets (id, name, public)
values ('registry-originals', 'registry-originals', false)
on conflict (id) do nothing;

drop policy if exists "registry_originals_owner_insert" on storage.objects;
create policy "registry_originals_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'registry-originals' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "registry_originals_owner_select" on storage.objects;
create policy "registry_originals_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'registry-originals' and (storage.foldername(name))[1] = auth.uid()::text);
