import { NextResponse, type NextRequest } from 'next/server';
import { getSharedLedgerProvider, parseParcelParams } from '@/lib/building-ledger';

export async function GET(request: NextRequest) {
  const provider = getSharedLedgerProvider();
  if (!provider.configured) {
    return NextResponse.json(
      {
        status: 'unconfigured',
        provider: provider.name,
        message: '공공데이터포털 건축물대장 인증키(DATA_GO_KR_SERVICE_KEY)가 설정되지 않았어요.',
      },
      { status: 503 },
    );
  }
  const parcel = parseParcelParams(request.nextUrl.searchParams);
  if (!parcel) {
    return NextResponse.json(
      { status: 'invalid', message: '조회할 주소의 법정동코드와 지번(본번·부번)을 확인해 주세요.' },
      { status: 400 },
    );
  }
  try {
    const result = await provider.lookup(parcel);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('Building ledger lookup failed:', error?.code || error?.name);
    return NextResponse.json(
      { status: 'error', provider: provider.name, message: '건축물대장 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.' },
      { status: 502 },
    );
  }
}
