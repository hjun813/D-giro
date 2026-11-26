import { NextResponse, type NextRequest } from 'next/server';
import { POINTS_CONFIG } from '@/lib/points-config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function loadWatchlist(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, userId: string) {
  const { data, error } = await supabase
    .from('watchlists')
    .select('target_id, memo, notify_channel, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!error && data) {
    return data.map((row: any) => ({
      targetId: row.target_id,
      memo: row.memo || '',
      notifyChannel: row.notify_channel || 'in_app',
      createdAt: row.created_at,
    }));
  }

  // Fallback if 0003 migration columns (memo, notify_channel) are not yet applied
  const { data: fallback } = await supabase
    .from('watchlists')
    .select('target_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return (fallback || []).map((row: any) => ({
    targetId: row.target_id,
    memo: '',
    notifyChannel: 'in_app' as const,
    createdAt: row.created_at,
  }));
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ configured: false, items: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ configured: true, items: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const items = await loadWatchlist(supabase, user.id);
  return NextResponse.json({ configured: true, items }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase 연결 설정이 필요합니다.' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: '관리 물건을 저장하려면 로그인해 주세요.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const targetId = String(body?.targetId || '').trim();
  const watched = body?.watched;
  const memo = typeof body?.memo === 'string' ? body.memo.slice(0, 120) : undefined;
  const notifyChannel = ['in_app', 'kakao', 'sms'].includes(body?.notifyChannel) ? body.notifyChannel : 'in_app';

  if (!targetId || typeof watched !== 'boolean') {
    return NextResponse.json({ message: '저장할 등기 대상을 확인해 주세요.' }, { status: 400 });
  }

  if (watched) {
    const payload: Record<string, any> = { user_id: user.id, target_id: targetId, notify_channel: notifyChannel };
    if (memo !== undefined) payload.memo = memo;

    let { error } = await supabase.from('watchlists').upsert(payload, { onConflict: 'user_id,target_id' });
    if (error) {
      // Fallback without 0003 columns
      const retry = await supabase.from('watchlists').upsert({ user_id: user.id, target_id: targetId }, { onConflict: 'user_id,target_id' });
      error = retry.error;
    }
    if (error) {
      return NextResponse.json({ message: '관심 물건을 저장하지 못했어요.' }, { status: 500 });
    }

    await supabase.from('point_ledger').insert({
      user_id: user.id,
      delta: -POINTS_CONFIG.monitorCost,
      reason: 'monitor_subscribe',
      ref_id: targetId,
      note: `${targetId} 변동 알림 구독`,
    }).then(() => {}, () => {});
  } else {
    const { error } = await supabase
      .from('watchlists')
      .delete()
      .eq('user_id', user.id)
      .eq('target_id', targetId);
    if (error) {
      return NextResponse.json({ message: '관심 물건에서 해제하지 못했어요.' }, { status: 500 });
    }
  }

  const items = await loadWatchlist(supabase, user.id);
  return NextResponse.json({
    configured: true,
    user: { id: user.id, email: user.email || '' },
    watchlist: items.map((item) => item.targetId),
    items,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase 연결 설정이 필요합니다.' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: '일괄 등록하려면 로그인해 주세요.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const rawItems: Array<{ targetId: string; memo?: string; notifyChannel?: string }> = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0 || rawItems.length > 500) {
    return NextResponse.json({ message: '1건 이상 500건 이하로 일괄 등록해 주세요.' }, { status: 400 });
  }

  const rows = rawItems
    .map((item) => ({
      user_id: user.id,
      target_id: String(item.targetId || '').trim(),
      memo: typeof item.memo === 'string' ? item.memo.slice(0, 120) : '',
      notify_channel: ['in_app', 'kakao', 'sms'].includes(item.notifyChannel || '') ? item.notifyChannel : 'in_app',
    }))
    .filter((row) => row.target_id.length > 0);

  let { error } = await supabase.from('watchlists').upsert(rows, { onConflict: 'user_id,target_id' });
  if (error) {
    const retry = await supabase
      .from('watchlists')
      .upsert(rows.map((r) => ({ user_id: r.user_id, target_id: r.target_id })), { onConflict: 'user_id,target_id' });
    error = retry.error;
  }

  if (error) {
    return NextResponse.json({ message: '일괄 등록에 실패했어요.' }, { status: 500 });
  }

  const items = await loadWatchlist(supabase, user.id);
  return NextResponse.json({ configured: true, added: rows.length, items }, { status: 201 });
}
