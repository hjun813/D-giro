import { NextResponse, type NextRequest } from 'next/server';
import { getRegistryMonitorAdmin } from '@/lib/monitor/access.server';
import {
  MANUAL_RESULT_TEXT_LIMIT,
  parseManualCheckTime,
  parseManualRegistryResult,
  projectManualRegistryResult,
  type ApplicationSnapshot,
} from '@/lib/monitor/manual-check';

const PAGE_SIZE = 40;

export async function GET(request: NextRequest) {
  const admin = await getRegistryMonitorAdmin();
  if (admin.status !== 200) return NextResponse.json({ message: admin.message }, { status: admin.status });

  const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 120) || '';
  const after = request.nextUrl.searchParams.get('after') || '';
  const { data, error } = await admin.db.rpc('monitor_admin_targets', {
    p_query: query, p_after: after, p_limit: PAGE_SIZE + 1,
  });
  if (error) {
    return NextResponse.json({ message: '확인 대상을 불러오지 못했습니다. 모니터링 DB 설정을 확인해 주세요.' }, { status: 500 });
  }

  const targets = (data || []).slice(0, PAGE_SIZE);
  return NextResponse.json({ targets, nextCursor: data?.length > PAGE_SIZE ? targets.at(-1).property_uid : null }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const admin = await getRegistryMonitorAdmin();
  if (admin.status !== 200) return NextResponse.json({ message: admin.message }, { status: admin.status });

  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return NextResponse.json({ message: '조회 결과 형식을 확인해 주세요.' }, { status: 415 });
  }
  if (Number(request.headers.get('content-length')) > MANUAL_RESULT_TEXT_LIMIT * 6 + 1024) {
    return NextResponse.json({ message: '조회 결과가 너무 깁니다.' }, { status: 413 });
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.propertyUid !== 'string' || !/^\d{4}-\d{4}-\d{6}$/.test(body.propertyUid)) {
    return NextResponse.json({ message: '목록에서 확인 대상을 선택해 주세요.' }, { status: 400 });
  }
  if (body.confirmed !== true) {
    return NextResponse.json({ message: '인터넷등기소에서 조회한 고유번호가 선택한 대상과 같은지 확인해 주세요.' }, { status: 400 });
  }
  if (typeof body.rawText !== 'string' || !body.rawText.trim() || body.rawText.length > MANUAL_RESULT_TEXT_LIMIT) {
    return NextResponse.json({ message: '조회 결과를 4만 자 이내로 입력해 주세요.' }, { status: 400 });
  }

  const checkedAt = parseManualCheckTime(body.checkedAt);
  if (!checkedAt) return NextResponse.json({ message: '조회한 시각을 한국 시간으로 입력해 주세요.' }, { status: 400 });

  const result = parseManualRegistryResult(body.propertyUid, body.rawText, checkedAt);
  if (!result) {
    return NextResponse.json({ message: '복사한 결과의 고유번호가 선택한 대상과 다릅니다.' }, { status: 400 });
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: state, error: readError } = await admin.db.from('monitor_states')
      .select('revision, last_success_at, known_applications')
      .eq('property_uid', result.propertyUid)
      .maybeSingle();
    if (readError) break;

    const revision = state?.revision ?? 0;
    const previous: ApplicationSnapshot = revision > 0 ? state?.known_applications ?? {} : {};
    const projected = projectManualRegistryResult(result, previous, revision > 0 ? state?.last_success_at ?? null : null);
    const { data: saved, error: commitError } = await admin.db.rpc('commit_manual_registry_check', {
      p_property_uid: result.propertyUid,
      p_revision: revision,
      p_checked_at: result.checkedAt,
      p_status: result.status,
      p_known_applications: projected.knownApplications,
      p_events: projected.events.map(({ eventKey, kind }) => ({ event_key: eventKey, kind })),
    }).single<{ outcome: string; events_created: number; notifications_created: number }>();
    if (commitError || !saved) break;

    if (saved.outcome === 'conflict') continue;
    if (saved.outcome === 'not_watched') {
      return NextResponse.json({ message: '현재 관심 등록이 없는 대상입니다. 목록을 다시 확인해 주세요.' }, { status: 404 });
    }
    if (saved.outcome === 'stale') {
      return NextResponse.json({ message: '이미 더 최근에 조회한 결과가 기록되어 있습니다.' }, { status: 409 });
    }
    return NextResponse.json({
      status: result.status,
      message: result.errorMessage,
      baseline: projected.baseline,
      applicationCount: result.applications.length,
      eventsCreated: saved.events_created,
      notificationsCreated: saved.notifications_created,
    });
  }

  return NextResponse.json({ message: '조회 결과를 저장하지 못했습니다. 잠시 후 같은 결과를 다시 제출해 주세요.' }, { status: 503 });
}
