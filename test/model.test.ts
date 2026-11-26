import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoSubmitSample,
  documentsFor,
  eventsFor,
  initialState,
  loadState,
  needsUpdate,
  runRound,
  saveState,
  submitSample,
  toggleWatch,
} from '../src/lib/model.ts';

const unit = 'sample-unit-101';
const neighbor = 'sample-unit-102';
const userA = 'user-a';
const userB = 'user-b';

test('동일 위치의 호수를 구분하고 틀린 문서와 보류된 자료의 게시를 막는다', () => {
  const state = initialState();
  assert.equal(documentsFor(state, unit).length, 1);
  assert.equal(documentsFor(state, neighbor).length, 0);
  assert.equal(submitSample(state, userA, neighbor, 'unit-base')?.status, 'mismatch');
  assert.equal(submitSample(state, userA, neighbor, 'unreadable')?.status, 'unreadable');
  assert.equal(submitSample(state, userA, neighbor, 'unmasked')?.status, 'review');
  assert.equal(documentsFor(state, neighbor).length, 0);
  assert.equal(submitSample(state, userA, neighbor, 'neighbor')?.status, 'published');
  assert.equal(documentsFor(state, neighbor)[0].sampleId, 'neighbor');
});

test('등기 파일을 올리면 주소를 미리 고르지 않아도 자동으로 대상을 매칭해 등록한다', () => {
  const state = initialState();
  assert.equal(documentsFor(state, neighbor).length, 0);
  const published = autoSubmitSample(state, userA, 'neighbor');
  assert.equal(published?.status, 'published');
  assert.equal(published?.targetId, neighbor);
  assert.equal(documentsFor(state, neighbor)[0].sampleId, 'neighbor');
  assert.equal(autoSubmitSample(state, userA, 'neighbor')?.status, 'duplicate');
  assert.equal(autoSubmitSample(state, userA, 'unmasked')?.status, 'review');
  const unreadable = autoSubmitSample(state, userA, 'unreadable');
  assert.equal(unreadable?.status, 'unreadable');
  assert.equal(unreadable?.targetId, null);
});

test('중복 문서를 건너뛰고 뒤늦게 제출한 문서는 발급 시각순으로 정렬한다', () => {
  const state = initialState();
  assert.equal(submitSample(state, userA, unit, 'unit-base')?.status, 'duplicate');
  assert.equal(submitSample(state, userA, unit, 'unit-old')?.status, 'published');
  assert.deepEqual(documentsFor(state, unit).map((document: any) => document.sampleId), ['unit-base', 'unit-old']);
});

test('같은 대상을 한 번 조회하고 현재 구독자에게만 알림을 보낸다', () => {
  const state = initialState();
  assert.equal(runRound(state), null);
  assert.equal(state.round, 0);
  toggleWatch(state, userA, unit);
  toggleWatch(state, userB, unit);
  const baseline = runRound(state);
  assert.equal(baseline?.count, 1);
  assert.equal(baseline?.newNotifications, 0);
  const received = runRound(state);
  assert.equal(received?.count, 1);
  assert.equal(received?.newNotifications, 2);
  toggleWatch(state, userB, unit);
  assert.equal(runRound(state)?.newNotifications, 1);
  assert.equal(runRound(state)?.newNotifications, 0);
  assert.equal(state.notifications.filter((alert: any) => alert.userId === userB).length, 1);
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
  assert.equal(runRound(state)?.newNotifications, 0);
  assert.deepEqual(eventsFor(state, unit).map((event: any) => event.kind), ['received', 'completed']);
  submitSample(state, userA, unit, 'unit-new');
  assert.equal(needsUpdate(state, unit), false);
  assert.equal(documentsFor(state, unit)[0].amount, 150000000);
});

test('테스트 사용자와 관심 등록을 로컬 스냅샷에서 복원한다', () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) };
  const state = loadState(storage);
  state.userId = userB;
  toggleWatch(state, userB, neighbor);
  saveState(storage, state);
  assert.equal(loadState(storage).userId, userB);
  assert.deepEqual(loadState(storage).watches[userB], [neighbor]);
  assert.deepEqual(loadState(storage).watches[userA], []);
});
