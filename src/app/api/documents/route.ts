import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { extractPdfText } from '@/lib/pdf-extract';
import { parseKoreanRegistryText } from '@/lib/registry-parser';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { maxSampleBytes } from '@/lib/uploads';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { configured } = getSupabaseConfig();
  if (!configured) {
    return NextResponse.json({ configured: false, documents: [], properties: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ configured: false, documents: [], properties: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const propertyId = request.nextUrl.searchParams.get('propertyId')?.trim();
  let docQuery = supabase
    .from('registry_documents')
    .select('id, property_id, file_sha256, status, issued_at, owner_masked, ownership_cause, mortgage_amount, creditor, rank_label, reflected_event_id, created_at')
    .eq('status', 'published')
    .order('issued_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (propertyId) docQuery = docQuery.eq('property_id', propertyId);

  const [{ data: documents, error: docError }, { data: properties }] = await Promise.all([
    docQuery,
    supabase
      .from('properties')
      .select('id, pnu, registry_unique_no, location_name, address, property_type, building_name, unit_name, area_text, structure, latitude, longitude')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (docError) {
    return NextResponse.json({ configured: true, documents: [], properties: [], error: '공유 문서를 불러오지 못했어요.' }, { status: 500 });
  }

  return NextResponse.json(
    { configured: true, documents: documents || [], properties: properties || [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase 연결 설정이 필요합니다.' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: '등기 자료를 등록하려면 로그인해 주세요.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const requestedPropertyId = String(formData.get('propertyId') || '').trim();
    const locationName = String(formData.get('locationName') || '').trim();
    const latitude = Number(formData.get('latitude'));
    const longitude = Number(formData.get('longitude'));
    const pnu = String(formData.get('pnu') || '').trim() || null;

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ message: '등록할 PDF 파일을 선택해 주세요.' }, { status: 400 });
    }
    if (!/\.pdf$/i.test(file.name)) {
      return NextResponse.json({ message: '실제 등기부등본 등록은 PDF 파일만 지원해요.' }, { status: 400 });
    }
    if (file.size > maxSampleBytes) {
      return NextResponse.json({ message: '5 MB 이하의 PDF 파일을 선택해 주세요.' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 4 || Buffer.from(bytes.subarray(0, 4)).toString() !== '%PDF') {
      return NextResponse.json({ message: '올바른 PDF 파일이 아니에요.' }, { status: 400 });
    }

    const fileSha256 = createHash('sha256').update(bytes).digest('hex');
    const rawText = await extractPdfText(bytes);
    if (!rawText.trim()) {
      return NextResponse.json(
        { message: 'PDF에서 텍스트를 추출하지 못했어요. 인터넷등기소 전자발급 PDF를 올려 주세요.' },
        { status: 422 },
      );
    }

    const parsed = parseKoreanRegistryText(rawText);
    const propertyId = requestedPropertyId || (parsed.registryUniqueNo ? `iros:${parsed.registryUniqueNo}` : '');
    if (!propertyId) {
      return NextResponse.json(
        { status: 'unreadable', message: '문서에서 부동산 고유번호를 식별하지 못했어요. 등기 대상을 먼저 선택하거나 고유번호가 포함된 PDF를 올려 주세요.' },
        { status: 422 },
      );
    }

    // 중복 파일 확인
    const { data: existing } = await supabase
      .from('registry_documents')
      .select('id, property_id')
      .eq('property_id', propertyId)
      .eq('file_sha256', fileSha256)
      .eq('status', 'published')
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        status: 'duplicate',
        propertyId,
        parsed,
        message: '이미 공유된 동일한 등기 PDF 파일이에요.',
      });
    }

    // 원본 PDF는 Private Storage에 격리 보관 (버킷 정책 미적용 환경에서도 DB 저장은 진행)
    const storagePath = `${user.id}/${fileSha256}.pdf`;
    await supabase.storage.from('registry-originals').upload(storagePath, bytes, {
      contentType: 'application/pdf',
      upsert: false,
    }).catch(() => {});

    // properties 메타데이터 best-effort upsert (RLS 정책 적용 시 자동 저장)
    if (parsed.address || locationName) {
      await supabase.from('properties').upsert({
        id: propertyId,
        pnu,
        registry_unique_no: parsed.registryUniqueNo,
        location_name: locationName || parsed.buildingName || '등록 부동산',
        address: parsed.address || locationName || '주소 미확인',
        property_type: parsed.propertyType,
        building_name: parsed.buildingName || locationName || '등기 대상',
        unit_name: parsed.unitName || null,
        area_text: parsed.areaText || null,
        structure: parsed.structure || null,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
      }, { onConflict: 'id' }).then(() => {}, () => {});
    }

    // 마스킹·구조화된 요약 데이터만 공개 테이블에 영구 저장
    const { data: inserted, error: insertError } = await supabase
      .from('registry_documents')
      .insert({
        property_id: propertyId,
        uploaded_by: user.id,
        file_sha256: fileSha256,
        storage_path: storagePath,
        status: 'published',
        issued_at: parsed.issuedAt || new Date().toISOString(),
        owner_masked: parsed.ownerMasked,
        ownership_cause: parsed.ownershipCause || null,
        mortgage_amount: parsed.mortgageAmount,
        creditor: parsed.creditor || null,
        rank_label: parsed.rankLabel || null,
      })
      .select('id, property_id, file_sha256, status, issued_at, owner_masked, ownership_cause, mortgage_amount, creditor, rank_label, reflected_event_id, created_at')
      .single();

    if (insertError) {
      console.error('Supabase insert registry_documents failed:', insertError.message);
      return NextResponse.json(
        { message: 'Supabase에 등기 자료를 저장하지 못했어요. DB 마이그레이션 SQL 적용 여부를 확인해 주세요.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: 'published',
      propertyId,
      parsed,
      document: inserted,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Document upload failed:', error?.message || error);
    return NextResponse.json({ message: '등기 PDF를 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, { status: 500 });
  }
}
