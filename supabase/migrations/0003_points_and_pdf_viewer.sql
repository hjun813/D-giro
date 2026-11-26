-- 0003: 포인트 원장, PDF 뷰어 열람 지원, 관리 물건 메모/알림 채널 확장

-- 1. 포인트 원장 테이블 (적립/차감 이력)
create table if not exists public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('welcome', 'upload_reward', 'document_view', 'monitor_subscribe', 'adjustment')),
  ref_id text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_point_ledger_user on public.point_ledger (user_id, created_at desc);

alter table public.point_ledger enable row level security;

drop policy if exists "point_ledger_owner_select" on public.point_ledger;
create policy "point_ledger_owner_select" on public.point_ledger
  for select using (auth.uid() = user_id);

drop policy if exists "point_ledger_owner_insert" on public.point_ledger;
create policy "point_ledger_owner_insert" on public.point_ledger
  for insert with check (auth.uid() = user_id);

-- 2. registry_documents 확장 (원본 파일명, 개인정보 안전 여부)
alter table public.registry_documents
  add column if not exists original_filename text,
  add column if not exists pii_safe boolean not null default true;

-- 3. watchlists 확장 (금융권 200건 관리용 메모, 알림 채널)
alter table public.watchlists
  add column if not exists memo text,
  add column if not exists notify_channel text not null default 'in_app'
    check (notify_channel in ('in_app', 'kakao', 'sms'));

-- 4. 공유(published) 등기 PDF를 인증된 회원이 Signed URL로 열람할 수 있도록 Storage 읽기 정책 보완
drop policy if exists "registry_originals_published_select" on storage.objects;
create policy "registry_originals_published_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'registry-originals'
    and exists (
      select 1
      from public.registry_documents d
      where d.storage_path = storage.objects.name
        and d.status = 'published'
    )
  );

-- 5. change_events / notifications 인증 사용자 기록 허용 (초기 수동 변동 확인·테스트용)
drop policy if exists "events_auth_insert" on public.change_events;
create policy "events_auth_insert" on public.change_events
  for insert to authenticated with check (true);

drop policy if exists "notifications_owner_insert" on public.notifications;
create policy "notifications_owner_insert" on public.notifications
  for insert to authenticated with check (auth.uid() = user_id);
