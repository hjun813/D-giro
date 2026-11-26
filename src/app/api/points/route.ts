import { NextResponse } from 'next/server';
import { POINTS_CONFIG } from '@/lib/points-config';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const { configured } = getSupabaseConfig();
  if (!configured) {
    return NextResponse.json({ configured: false, balance: 0, ledger: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ configured: false, balance: 0, ledger: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ configured: true, balance: 0, ledger: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error } = await supabase
    .from('point_ledger')
    .select('id, delta, reason, ref_id, note, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    // 0003 마이그레이션 미적용 시 기본 웰컴 포인트만 반환
    return NextResponse.json(
      { configured: true, balance: POINTS_CONFIG.welcomeBonus, ledger: [], migrationPending: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const rows = data || [];
  const balance = POINTS_CONFIG.welcomeBonus + rows.reduce((sum, row) => sum + (Number(row.delta) || 0), 0);

  return NextResponse.json(
    {
      configured: true,
      balance,
      ledger: rows.map((row) => ({
        id: row.id,
        delta: row.delta,
        reason: row.reason,
        refId: row.ref_id,
        note: row.note || '',
        createdAt: row.created_at,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
