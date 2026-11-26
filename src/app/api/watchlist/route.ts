import { NextResponse, type NextRequest } from 'next/server';
import { targets } from '@/lib/fixtures';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const targetIds = new Set(targets.map((target) => target.id));

export async function PUT(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase 연결 설정(NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)이 필요합니다.' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: '관심 목록을 저장하려면 로그인해 주세요.' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!targetIds.has(body?.targetId) || typeof body?.watched !== 'boolean') {
    return NextResponse.json({ message: '저장할 등기 대상을 확인해 주세요.' }, { status: 400 });
  }
  if (body.accountId && body.accountId !== user.id) {
    return NextResponse.json({ message: '로그인한 계정이 바뀌었어요. 현재 목록을 다시 확인해 주세요.' }, { status: 409 });
  }

  if (body.watched) {
    const { error } = await supabase
      .from('watchlists')
      .upsert({ user_id: user.id, target_id: body.targetId }, { onConflict: 'user_id,target_id' });
    if (error) {
      return NextResponse.json({ message: '관심 목록을 저장하지 못했어요.' }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from('watchlists')
      .delete()
      .eq('user_id', user.id)
      .eq('target_id', body.targetId);
    if (error) {
      return NextResponse.json({ message: '관심 목록에서 해제하지 못했어요.' }, { status: 500 });
    }
  }

  const { data: rows } = await supabase
    .from('watchlists')
    .select('target_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    configured: true,
    user: { id: user.id, email: user.email || '' },
    watchlist: (rows || []).map((row) => row.target_id),
  });
}
