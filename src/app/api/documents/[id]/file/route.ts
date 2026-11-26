import { NextResponse, type NextRequest } from 'next/server';
import { POINTS_CONFIG } from '@/lib/points-config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase 연결 설정이 필요합니다.' }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: '공유 등기 PDF를 열람하려면 로그인해 주세요.' }, { status: 401 });
  }

  const { data: doc, error } = await supabase
    .from('registry_documents')
    .select('id, property_id, uploaded_by, storage_path, status')
    .eq('id', id)
    .single();

  if (error || !doc || !doc.storage_path) {
    return NextResponse.json({ message: '열람할 PDF 파일을 찾지 못했어요.' }, { status: 404 });
  }

  if (doc.status !== 'published' && doc.uploaded_by !== user.id) {
    return NextResponse.json({ message: '공개되지 않은 등기 자료예요.' }, { status: 403 });
  }

  // 본인 업로드가 아닌 경우 포인트 차감 내역 기록 (이미 열람한 문서 제외, best-effort)
  if (doc.uploaded_by !== user.id && POINTS_CONFIG.viewCost > 0) {
    const { data: alreadyViewed } = await supabase
      .from('point_ledger')
      .select('id')
      .eq('user_id', user.id)
      .eq('reason', 'document_view')
      .eq('ref_id', doc.id)
      .limit(1);

    if (!alreadyViewed || alreadyViewed.length === 0) {
      await supabase.from('point_ledger').insert({
        user_id: user.id,
        delta: -POINTS_CONFIG.viewCost,
        reason: 'document_view',
        ref_id: doc.id,
        note: `${doc.property_id} 공유 등기 PDF 열람`,
      }).then(() => {}, () => {});
    }
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('registry-originals')
    .createSignedUrl(doc.storage_path, 300);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ message: 'PDF 열람 링크를 만들지 못했어요. Storage 권한 정책(0003 마이그레이션)을 확인해 주세요.' }, { status: 500 });
  }

  return NextResponse.json(
    { url: signed.signedUrl, expiresIn: 300 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
