import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { configured: false, notifications: [], monitorStates: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { configured: true, notifications: [], monitorStates: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const [{ data: notifRows, error: notificationError }, { data: stateRows, error: stateError }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, property_id, event_id, kind, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.rpc('monitor_my_watch_status'),
  ]);
  if (notificationError || stateError) {
    return NextResponse.json({ message: '변동 확인 내역을 불러오지 못했습니다.' }, { status: 503 });
  }

  const notifications = (notifRows || []).map((row: any) => ({
    id: row.id,
    propertyId: row.property_id,
    eventId: row.event_id,
    kind: row.kind === 'completed' ? 'completed' : 'received',
    read: Boolean(row.read),
    createdAt: row.created_at,
  }));

  const monitorStates = (stateRows || []).map((row: any) => ({
    targetId: row.target_id,
    propertyUid: row.property_uid,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    lastStatus: row.last_status,
    hasOpenApplication: row.has_open_application,
    hasCompletedEvent: row.has_completed_event,
  }));

  return NextResponse.json(
    { configured: true, notifications, monitorStates },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase 연결 설정이 필요합니다.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);

  if (error) {
    return NextResponse.json({ message: '알림 읽음 처리에 실패했어요.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
