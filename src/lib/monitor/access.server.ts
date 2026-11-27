import { createClient, type User } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export function canManageRegistryMonitor(user: User): boolean {
  return user.app_metadata?.monitor_admin === true;
}

export async function getRegistryMonitorAdmin() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: 503, message: 'Supabase 연결 설정이 필요합니다.' } as const;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: '관리자 계정으로 로그인해 주세요.' } as const;
  if (!canManageRegistryMonitor(user)) return { status: 403, message: '등기변동 관리 권한이 필요합니다.' } as const;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return { status: 503, message: '관리자용 Supabase 서버 키 설정이 필요합니다.' } as const;

  return {
    status: 200,
    db: createClient(getSupabaseConfig().url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  } as const;
}
