import assert from 'node:assert/strict';
import test from 'node:test';
import { documentsFor, eventsFor, initialState, loadState, needsUpdate, runRound, saveState, submitSample, toggleWatch } from '../web/model.js';
import { dedupeKakaoResults, demoSearch, normalizeKakaoResult } from '../web/map.js';

const unit = 'sample-unit-101';
const neighbor = 'sample-unit-102';
const userA = 'user-a';
const userB = 'user-b';

test('주소, 지번, 건물명으로 같은 검증 위치를 검색한다', () => {
  for (const term of ['서울시청', '세종대로 110', '태평로1가 31']) {
    assert.equal(demoSearch(term)[0].id, 'city-hall');
  }
  assert.deepEqual(demoSearch('없는검색결과'), []);
});

test('같은 공공 장소의 카카오 주소 결과와 부서명 결과를 하나의 검증 위치 이름으로 표시한다', () => {
  const coordinates = { x: '126.9784', y: '37.5663' };
  const address = normalizeKakaoResult({ ...coordinates, address_name: '서울 중구 세종대로 110' });
  const office = normalizeKakaoResult({ ...coordinates, id: 'office', place_name: '서울특별시청 부서', road_address_name: '서울 중구 세종대로 110' });
  assert.equal(address.id, 'city-hall');
  assert.equal(office.id, address.id);
  assert.equal(office.name, '서울시청');
});

test('일반 카카오맵 검색에서 동일 위치의 같은 이름 결과는 중복 제거하고 서로 다른 장소는 유지한다', () => {
  const deduped = dedupeKakaoResults([
    { x: '126.9820', y: '37.5660', address_name: '서울 중구 을지로 100' },
    { id: 'place-1', x: '126.9821', y: '37.5661', place_name: '서울 중구 을지로 100', road_address_name: '서울 중구 을지로 100' },
    { id: 'place-2', x: '126.9820', y: '37.5660', place_name: '을지로 빌딩', road_address_name: '서울 중구 을지로 100' },
    { id: 'invalid', x: 'NaN', y: '37.5660', place_name: '좌표 오류' },
  ]);
  assert.deepEqual(deduped.map((item) => item.name), ['서울 중구 을지로 100', '을지로 빌딩']);
});

test('동일 위치의 호수를 구분하고 틀린 문서와 보류된 자료의 게시를 막는다', () => {
  const state = initialState();
  assert.equal(documentsFor(state, unit).length, 1);
  assert.equal(documentsFor(state, neighbor).length, 0);
  assert.equal(submitSample(state, userA, neighbor, 'unit-base').status, 'mismatch');
  assert.equal(submitSample(state, userA, neighbor, 'unreadable').status, 'unreadable');
  assert.equal(submitSample(state, userA, neighbor, 'unmasked').status, 'review');
  assert.equal(documentsFor(state, neighbor).length, 0);
  assert.equal(submitSample(state, userA, neighbor, 'neighbor').status, 'published');
  assert.equal(documentsFor(state, neighbor)[0].sampleId, 'neighbor');
});

test('중복 문서를 건너뛰고 뒤늦게 제출한 문서는 발급 시각순으로 정렬한다', () => {
  const state = initialState();
  assert.equal(submitSample(state, userA, unit, 'unit-base').status, 'duplicate');
  assert.equal(submitSample(state, userA, unit, 'unit-old').status, 'published');
  assert.deepEqual(documentsFor(state, unit).map((document) => document.sampleId), ['unit-base', 'unit-old']);
});

test('같은 대상을 한 번 조회하고 현재 구독자에게만 알림을 보낸다', () => {
  const state = initialState();
  assert.equal(runRound(state), null);
  assert.equal(state.round, 0);
  toggleWatch(state, userA, unit);
  toggleWatch(state, userB, unit);
  const baseline = runRound(state);
  assert.equal(baseline.count, 1);
  assert.equal(baseline.newNotifications, 0);
  const received = runRound(state);
  assert.equal(received.count, 1);
  assert.equal(received.newNotifications, 2);
  toggleWatch(state, userB, unit);
  assert.equal(runRound(state).newNotifications, 1);
  assert.equal(runRound(state).newNotifications, 0);
  assert.equal(state.notifications.filter((alert) => alert.userId === userB).length, 1);
});

test('조회 실패와 지연 응답에도 문서와 사건 상태를 보존한다', () => {
  const state = initialState();
  toggleWatch(state, userA, unit);
  runRound(state);
  runRound(state);
  runRound(state);
  assert.equal(needsUpdate(state, unit), true);
  runRound(state);
  const { lastSuccessAt } = state.checks[unit];
  runRound(state);
  assert.equal(state.checks[unit].outcome, 'failure');
  assert.equal(state.checks[unit].lastSuccessAt, lastSuccessAt);
  assert.equal(needsUpdate(state, unit), true);
  assert.equal(runRound(state).newNotifications, 0);
  assert.deepEqual(eventsFor(state, unit).map((event) => event.kind), ['received', 'completed']);
  submitSample(state, userA, unit, 'unit-new');
  assert.equal(needsUpdate(state, unit), false);
  assert.equal(documentsFor(state, unit)[0].amount, 150000000);
});

test('기존 저장 기록의 알림과 최근 상태에서 확인된 변동 이력을 복원한다', () => {
  const state = initialState();
  state.version = 1;
  state.events[unit] = { id: `${unit}:application-1`, kind: 'completed', at: '2026-11-23T07:00:00Z' };
  state.notifications = [
    { userId: userA, targetId: unit, kind: 'received', at: '2026-11-23T03:00:00Z' },
    { userId: userB, targetId: unit, kind: 'received', at: '2026-11-23T03:00:00Z' },
  ];
  const restored = loadState({ getItem: () => JSON.stringify(state) });
  assert.deepEqual(eventsFor(restored, unit).map((event) => event.kind), ['received', 'completed']);
  assert.equal(restored.notifications.length, 2);
  assert.equal(needsUpdate(restored, unit), true);
});

test('테스트 사용자와 관심 등록을 로컬 스냅샷에서 복원한다', () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  const state = loadState(storage);
  state.userId = userB;
  toggleWatch(state, userB, neighbor);
  saveState(storage, state);
  assert.equal(loadState(storage).userId, userB);
  assert.deepEqual(loadState(storage).watches[userB], [neighbor]);
  assert.deepEqual(loadState(storage).watches[userA], []);
});
