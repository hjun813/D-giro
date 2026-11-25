import assert from 'node:assert/strict';
import test from 'node:test';
import { documentsFor, initialState, loadState, needsUpdate, runRound, saveState, submitSample, toggleWatch } from '../web/model.js';
import { demoSearch } from '../web/map.js';

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
  assert.equal(state.events[unit].kind, 'completed');
  submitSample(state, userA, unit, 'unit-new');
  assert.equal(needsUpdate(state, unit), false);
  assert.equal(documentsFor(state, unit)[0].amount, 150000000);
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
