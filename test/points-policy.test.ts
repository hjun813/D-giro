import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePdfViewCharge,
  calculateWatchlistCharge,
  isNewerRegistryDocument,
  POINTS_CONFIG,
} from '../src/lib/points-config.ts';

test('PDF 조회는 하루 10회까지 무료이고 11회째부터 10P를 차감한다', () => {
  assert.equal(POINTS_CONFIG.dailyFreeViews, 10);
  assert.equal(POINTS_CONFIG.viewCost, 10);

  const first = calculatePdfViewCharge(0, false);
  assert.equal(first.isFree, true);
  assert.equal(first.cost, 0);
  assert.equal(first.usedTodayAfter, 1);
  assert.equal(first.freeRemainingAfter, 9);

  const tenth = calculatePdfViewCharge(9, false);
  assert.equal(tenth.isFree, true);
  assert.equal(tenth.cost, 0);
  assert.equal(tenth.usedTodayAfter, 10);
  assert.equal(tenth.freeRemainingAfter, 0);

  const eleventh = calculatePdfViewCharge(10, false);
  assert.equal(eleventh.isFree, false);
  assert.equal(eleventh.cost, 10);
  assert.equal(eleventh.usedTodayAfter, 11);

  // 본인 업로드 또는 이미 열람한 문서는 무료이며 일 횟수를 소비하지 않는다
  const repeat = calculatePdfViewCharge(10, true);
  assert.equal(repeat.isFree, true);
  assert.equal(repeat.cost, 0);
  assert.equal(repeat.usedTodayAfter, 10);
});

test('등기 등록 포인트는 해당 물건의 최신 등기에 한해서만 지급 대상이 된다', () => {
  assert.equal(POINTS_CONFIG.uploadReward, 100);
  assert.equal(isNewerRegistryDocument('2026-11-27T01:00:00Z', null), true);
  assert.equal(isNewerRegistryDocument('2026-11-27T02:00:00Z', '2026-11-27T01:00:00Z'), true);
  assert.equal(isNewerRegistryDocument('2026-11-27T01:00:00Z', '2026-11-27T01:00:00Z'), false);
  assert.equal(isNewerRegistryDocument('2026-11-26T23:00:00Z', '2026-11-27T01:00:00Z'), false);
});

test('관심 등록/알림은 단건(1건) 무료, 이후 추가 건마다 월 30P를 차감한다', () => {
  assert.equal(POINTS_CONFIG.freeWatchlistCount, 1);
  assert.equal(POINTS_CONFIG.monitorCost, 30);

  // 첫 1건 등록: 무료
  assert.deepEqual(calculateWatchlistCharge(0, 1), {
    freeCount: 1,
    paidCount: 0,
    totalCost: 0,
  });

  // 2번째 단건 등록: 30P
  assert.deepEqual(calculateWatchlistCharge(1, 1), {
    freeCount: 0,
    paidCount: 1,
    totalCost: 30,
  });

  // 0건 상태에서 5건 일괄 등록: 1건 무료 + 4건 유료(120P)
  assert.deepEqual(calculateWatchlistCharge(0, 5), {
    freeCount: 1,
    paidCount: 4,
    totalCost: 120,
  });

  // 2건 상태에서 3건 일괄 등록: 3건 모두 유료(90P)
  assert.deepEqual(calculateWatchlistCharge(2, 3), {
    freeCount: 0,
    paidCount: 3,
    totalCost: 90,
  });
});
