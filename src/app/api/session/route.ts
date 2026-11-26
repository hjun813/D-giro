import { NextResponse } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const { configured } = getSupabaseConfig();
  if (!configured) {
    return NextResponse.json({ configured: false, user: null, watchlist: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ configured: false, user: null, watchlist: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ configured: true, user: null, watchlist: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const { data: rows } = await supabase
    .from('watchlists')
    .select('target_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return NextResponse.json(
    {
      configured: true,
      user: { id: user.id, email: user.email || '' },
      watchlist: (rows || []).map((row) => row.target_id),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
