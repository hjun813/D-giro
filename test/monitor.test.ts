import assert from 'node:assert/strict';
import test from 'node:test';
import { parseManualCheckTime, parseManualRegistryResult, projectManualRegistryResult } from '../src/lib/monitor/manual-check.ts';
import {
  createMonitorProvider,
  deduplicateWatchTargets,
  isKoreanBusinessDay,
  MockMonitorProvider,
  normalizePropertyUid,
  parseApplicationResultText,
  runMonitorBatch,
  shouldPollTarget,
} from '../src/lib/monitor/index.ts';

const UID_A = '1145-1996-123456';
const UID_B = '1145-1996-654321';

test('14자리 부동산 고유번호를 정규화하고 잘못된 입력을 거른다', () => {
  assert.equal(normalizePropertyUid('11451996123456'), UID_A);
  assert.equal(normalizePropertyUid('1145-1996-123456'), UID_A);
  assert.equal(normalizePropertyUid(' 1145 1996 123456 '), UID_A);
  assert.equal(normalizePropertyUid('1145-1996-12345'), null);
  assert.equal(normalizePropertyUid('invalid'), null);
});

test('동일 고유번호 구독을 중복 제거하고 intensive 티어를 우선 적용한다', () => {
  const targets = deduplicateWatchTargets([
    { userId: 'u1', propertyUid: '11451996123456', tier: 'standard' },
    { userId: 'u2', propertyUid: '1145-1996-123456', ownerName: '김*준', tier: 'intensive' },
    { userId: 'u1', propertyUid: '1145-1996-123456', tier: 'standard' },
    { userId: 'u3', propertyUid: 'invalid-uid', tier: 'standard' },
  ]);

  assert.equal(targets.length, 1);
  assert.equal(targets[0].propertyUid, UID_A);
  assert.equal(targets[0].tier, 'intensive');
  assert.equal(targets[0].ownerName, '김*준');
  assert.deepEqual(targets[0].subscribers, ['u1', 'u2']);
});

test('평일 영업시간 한정 차등 폴링(standard 18:30 / intensive 11:00·15:00·18:30)이 동작한다', () => {
  // 2026-11-28(토) 12:00 KST -> 주말 제외
  const saturday = new Date('2026-11-28T12:00:00+09:00');
  assert.equal(isKoreanBusinessDay(saturday), false);
  assert.equal(shouldPollTarget({ tier: 'intensive', lastSuccessAt: null }, saturday).reason, 'non_business_day');

  // 공휴일 제외
  const friday = new Date('2026-11-27T18:40:00+09:00');
  const holidays = new Set(['2026-11-27']);
  assert.equal(shouldPollTarget({ tier: 'standard', lastSuccessAt: null }, friday, holidays).reason, 'non_business_day');

  // 평일 11:10 KST -> intensive는 due, standard는 18:30 전이라 대기
  const morning = new Date('2026-11-27T11:10:00+09:00');
  assert.equal(shouldPollTarget({ tier: 'intensive', lastSuccessAt: null }, morning).due, true);
  assert.equal(shouldPollTarget({ tier: 'standard', lastSuccessAt: null }, morning).reason, 'before_first_slot');

  // 같은 슬롯(11:00)에서 이미 성공했으면 재조회하지 않음
  assert.equal(
    shouldPollTarget({ tier: 'intensive', lastSuccessAt: '2026-11-27T11:05:00+09:00' }, morning).reason,
    'already_checked_in_slot',
  );

  // 15:05 KST가 되면 다음 슬롯(15:00) 도래로 다시 due
  const afternoon = new Date('2026-11-27T15:05:00+09:00');
  assert.equal(
    shouldPollTarget({ tier: 'intensive', lastSuccessAt: '2026-11-27T11:05:00+09:00' }, afternoon).due,
    true,
  );
});

test('고유번호 1회 조회 후 신규 접수·완료 감지와 실패 보존, 팬아웃 알림을 수행한다', async () => {
  const provider = new MockMonitorProvider({
    [UID_A]: [
      // 1회차(기준 조회): 기존 변동 없음
      { status: 'ok', checkedAt: '2026-11-27T11:01:00+09:00', applications: [] },
      // 2회차: 근저당권설정 신규 접수
      {
        status: 'ok',
        checkedAt: '2026-11-27T15:01:00+09:00',
        applications: [
          { receiptDate: '2026-11-27', receiptNo: '10452', purpose: '근저당권설정', status: 'received' },
        ],
      },
      // 3회차: 동일 응답 재수신 (중복 알림 없어야 함)
      {
        status: 'ok',
        checkedAt: '2026-11-27T18:31:00+09:00',
        applications: [
          { receiptDate: '2026-11-27', receiptNo: '10452', purpose: '근저당권설정', status: 'received' },
        ],
      },
      // 4회차: 조회 실패(rate_limited) -> 직전 성공 시각과 스냅샷 보존 + 재시도 큐
      {
        status: 'rate_limited',
        checkedAt: '2026-11-30T11:01:00+09:00',
        errorCode: 'TOO_MANY_REQUESTS',
        errorMessage: '시간당 조회 제한',
      },
      // 5회차: 등기 완료 전이
      {
        status: 'ok',
        checkedAt: '2026-11-30T15:01:00+09:00',
        applications: [
          { receiptDate: '2026-11-27', receiptNo: '10452', purpose: '근저당권설정', status: 'completed' },
        ],
      },
    ],
  });

  const subscriptions = [
    { userId: 'bank-1', propertyUid: UID_A, ownerName: '홍길동', tier: 'intensive' as const },
    { userId: 'tenant-1', propertyUid: UID_A, tier: 'standard' as const },
    { userId: 'other-1', propertyUid: UID_B, tier: 'standard' as const },
  ];

  // 1회차 (11:05 KST): UID_A(intensive)만 조회, UID_B(standard)는 스킵
  const r1 = await runMonitorBatch({
    provider,
    subscriptions,
    now: new Date('2026-11-27T11:05:00+09:00'),
  });
  assert.equal(r1.polledCount, 1);
  assert.equal(r1.skippedCount, 1);
  assert.equal(r1.notifications.length, 0);
  assert.equal(provider.callCount, 1);

  // 2회차 (15:05 KST): UID_A 1회 조회 -> bank-1, tenant-1 두 명에게 팬아웃
  const r2 = await runMonitorBatch({
    provider,
    subscriptions,
    previousStates: r1.updatedStates,
    now: new Date('2026-11-27T15:05:00+09:00'),
  });
  assert.equal(r2.polledCount, 1);
  assert.equal(r2.events.length, 1);
  assert.equal(r2.events[0].kind, 'received');
  assert.equal(r2.notifications.length, 2);
  assert.deepEqual(r2.notifications.map((n) => n.userId).sort(), ['bank-1', 'tenant-1']);

  // 3회차 (18:35 KST): UID_A는 동일 응답(알림 0건), UID_B는 기준 조회
  const r3 = await runMonitorBatch({
    provider,
    subscriptions,
    previousStates: r2.updatedStates,
    now: new Date('2026-11-27T18:35:00+09:00'),
  });
  assert.equal(r3.polledCount, 2);
  assert.equal(r3.notifications.length, 0);

  // 4회차 (월요일 11:05 KST): rate_limited 실패 -> lastSuccessAt 보존, retryQueue 기록
  const r4 = await runMonitorBatch({
    provider,
    subscriptions,
    previousStates: r3.updatedStates,
    now: new Date('2026-11-30T11:05:00+09:00'),
  });
  assert.equal(r4.failedCount, 1);
  assert.equal(r4.retryQueue[0].status, 'rate_limited');
  assert.equal(r4.updatedStates[UID_A].lastSuccessAt, '2026-11-27T18:31:00+09:00');
  assert.equal(r4.notifications.length, 0);

  // 5회차 (월요일 15:05 KST): 완료 전이 감지 -> 2명에게 완료 알림
  const r5 = await runMonitorBatch({
    provider,
    subscriptions,
    previousStates: r4.updatedStates,
    now: new Date('2026-11-30T15:05:00+09:00'),
  });
  assert.equal(r5.events.length, 1);
  assert.equal(r5.events[0].kind, 'completed');
  assert.equal(r5.notifications.length, 2);
});

test('미연동 외부 공급처 요청 시 모의 응답으로 위장하지 않고 명시적 오류를 던진다', () => {
  assert.equal(createMonitorProvider('mock').isMock, true);
  assert.throws(() => createMonitorProvider('deunggigo'), /아직 계약·연동되지 않았습니다/);
});

test('신청사건 결과 파서가 미존재·신규접수·보안문자/차단·로그인만료·오류 응답을 정확히 구분한다', () => {
  // 1) 신청 사건 없음
  const empty = parseApplicationResultText({
    propertyUid: UID_A,
    rawText: '해당 등기 신청 사건이 존재하지 않습니다.',
  });
  assert.equal(empty.status, 'ok');
  assert.equal(empty.applications.length, 0);

  // 2) 표 형태 신규 사건 (가압류 + 근저당권설정)
  const found = parseApplicationResultText({
    propertyUid: UID_A,
    rawText: [
      '2026-11-27\t10452\t서울중앙지방법원 등기국\t가압류\t접수',
      '2026.11.26 | 99812 | 근저당권설정 | 등기완료',
    ].join('\n'),
  });
  assert.equal(found.status, 'ok');
  assert.equal(found.applications.length, 2);
  assert.equal(found.applications[0].purpose, '가압류');
  assert.equal(found.applications[0].status, 'received');
  assert.equal(found.applications[0].registryOffice, '서울중앙지방법원 등기국');
  assert.equal(found.applications[1].receiptDate, '2026-11-26');
  assert.equal(found.applications[1].status, 'completed');

  // 3) 보안문자 / 조회 제한 감지 시 우회하지 않고 즉시 rate_limited
  const captcha = parseApplicationResultText({
    propertyUid: UID_A,
    rawText: '자동입력 방지 보안문자를 입력해 주세요.',
  });
  assert.equal(captcha.status, 'rate_limited');
  assert.equal(captcha.errorCode, 'BLOCKED_OR_CAPTCHA');

  // 4) 로그인 만료 감지 시 auth_required
  const auth = parseApplicationResultText({
    propertyUid: UID_A,
    rawText: '세션이 만료되었습니다. 다시 로그인해 주세요.',
  });
  assert.equal(auth.status, 'auth_required');

  // 5) 알 수 없는 응답은 절대 변동 없음(ok)으로 처리하지 않고 failed
  const unknown = parseApplicationResultText({
    propertyUid: UID_A,
    rawText: '<html><body>일시적인 시스템 점검</body></html>',
  });
  assert.equal(unknown.status, 'failed');
  assert.equal(unknown.errorCode, 'UNRECOGNIZED_RESPONSE');
});

test('수동 결과는 한국 시각과 대상 번호를 검증하고 일부만 해석한 응답을 실패로 처리한다', () => {
  const now = new Date('2026-11-27T03:00:00Z');
  assert.equal(parseManualCheckTime('2026-11-27T11:21', now), '2026-11-27T02:21:00.000Z');
  assert.equal(parseManualCheckTime('2026-11-27T12:01', now), null);
  assert.equal(parseManualCheckTime('2026-02-30T11:21', now), null);
  assert.equal(parseManualRegistryResult(UID_A, `부동산 고유번호: ${UID_B}\n검색 결과가 없습니다.`, now.toISOString()), null);

  const result = parseManualRegistryResult(UID_A, [
    `부동산 고유번호: ${UID_A}`,
    '2026-11-27 | 10452 | 가압류 | 등기완료',
    '2026-11-27 | 10453 | 근저당권설정 | 미완료',
  ].join('\n'), now.toISOString());
  assert.equal(result?.status, 'failed');
  assert.deepEqual(result?.applications, []);
});

test('수동 변동 판정은 기준 조회·재수신·완료 역행을 처리하고 공유 스냅샷에 원문을 남기지 않는다', () => {
  const checkedAt = '2026-11-27T03:00:00Z';
  function parse(text: string) {
    const result = parseManualRegistryResult(UID_A, text, checkedAt);
    assert.ok(result);
    return result;
  }

  const empty = projectManualRegistryResult(parse('검색 결과가 없습니다.'), {}, null);
  assert.equal(empty.baseline, true);
  assert.deepEqual(empty.events, []);

  const receipt = parse('2026-11-27 | 10452 | 소유권이전 신청인 홍길동 | 접수');
  const received = projectManualRegistryResult(receipt, empty.knownApplications, checkedAt);
  assert.deepEqual(received.events.map(({ kind }) => kind), ['received']);
  assert.deepEqual(received.knownApplications, {
    '2026-11-27:10452': { receiptDate: '2026-11-27', receiptNo: '10452', status: 'received' },
  });
  assert.deepEqual(projectManualRegistryResult(receipt, received.knownApplications, checkedAt).events, []);
  assert.deepEqual(projectManualRegistryResult(parse('다시 로그인해 주세요.'), received.knownApplications, checkedAt).knownApplications, received.knownApplications);

  const corrected = projectManualRegistryResult(parse('2026-11-27 | 10452 | 소유권이전 | 보정완료'), received.knownApplications, checkedAt);
  assert.deepEqual(corrected.events, []);
  assert.equal(corrected.knownApplications['2026-11-27:10452'].status, 'correction');
  const completed = projectManualRegistryResult(parse('2026-11-27 | 10452 | 소유권이전 | 등기완료'), corrected.knownApplications, checkedAt);
  assert.deepEqual(completed.events.map(({ kind }) => kind), ['completed']);
  const lateReceipt = projectManualRegistryResult(receipt, completed.knownApplications, checkedAt);
  assert.deepEqual(lateReceipt.events, []);
  assert.deepEqual(lateReceipt.knownApplications, completed.knownApplications);
});
