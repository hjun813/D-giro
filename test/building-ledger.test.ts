import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMolitLedgerProvider,
  normalizeTitleItems,
  normalizeUnitItems,
  parseParcelParams,
} from '../src/lib/building-ledger.ts';

test('지번과 법정동코드 파라미터를 검증하고 19자리 PNU를 생성한다', () => {
  const parsed = parseParcelParams(new URLSearchParams({
    sigunguCd: '11680',
    bjdongCd: '10100',
    platGbCd: '0',
    bun: '858',
    ji: '0',
  }));
  assert.deepEqual(parsed, {
    sigunguCd: '11680',
    bjdongCd: '10100',
    platGbCd: '0',
    bun: '0858',
    ji: '0000',
    pnu: '1168010100108580000',
  });
  assert.equal(parseParcelParams(new URLSearchParams({ sigunguCd: '1168', bjdongCd: '10100', bun: '1' })), null);
});

test('공공데이터포털의 단일 객체·배열·빈 문자열 응답을 정규화하고 전유 주건축물만 정렬한다', () => {
  const titles = normalizeTitleItems({
    item: {
      bldNm: '테스트타워',
      mainPurpsCdNm: '업무시설',
      strctCdNm: '철근콘크리트구조',
      totArea: '1240.5',
      grndFlrCnt: '10',
      ugrndFlrCnt: '2',
      useAprDay: '20210512',
    },
  });
  assert.equal(titles.length, 1);
  assert.equal(titles[0].buildingName, '테스트타워');
  assert.equal(titles[0].approvalDate, '2021-05-12');
  assert.deepEqual(normalizeTitleItems(''), []);

  const units = normalizeUnitItems({
    item: [
      { dongNm: '101동', hoNm: '1002호', exposPubuseGbCdNm: '전유', mainAtchGbCdNm: '주건축물', area: '84.9' },
      { dongNm: '101동', hoNm: '201호', exposPubuseGbCdNm: '전유', mainAtchGbCdNm: '주건축물', area: '59.8' },
      { dongNm: '101동', hoNm: '201호', exposPubuseGbCdNm: '공용', mainAtchGbCdNm: '주건축물', area: '24.1' },
    ],
  });
  assert.deepEqual(units.map((u) => `${u.dong} ${u.ho}`), ['101동 201호', '101동 1002호']);
});

test('건축물대장 공급자가 인증키 미설정과 정상 조회 캐싱을 구분한다', async () => {
  const unconfigured = createMolitLedgerProvider({ serviceKey: '' });
  assert.equal(unconfigured.configured, false);
  const parcel = parseParcelParams(new URLSearchParams({ sigunguCd: '11680', bjdongCd: '10100', bun: '858', ji: '0' }))!;
  assert.equal((await unconfigured.lookup(parcel)).status, 'unconfigured');

  let fetchCount = 0;
  const mockFetch: any = async (url: string) => {
    fetchCount += 1;
    const isTitle = url.includes('getBrTitleInfo');
    return {
      ok: true,
      async json() {
        return {
          response: {
            header: { resultCode: '00' },
            body: {
              items: {
                item: isTitle
                  ? { bldNm: '강남빌딩', mainPurpsCdNm: '근린생활시설', totArea: '510.2', useAprDay: '20190301' }
                  : [{ dongNm: 'A동', hoNm: '301호', exposPubuseGbCdNm: '전유', mainAtchGbCdNm: '주건축물', area: '45.2' }],
              },
            },
          },
        };
      },
    };
  };
  const provider = createMolitLedgerProvider({ serviceKey: 'demo-key', fetchImpl: mockFetch });
  const first = await provider.lookup(parcel);
  assert.equal(first.status, 'ok');
  assert.equal(first.cached, false);
  assert.equal(fetchCount, 2);

  const second = await provider.lookup(parcel);
  assert.equal(second.cached, true);
  assert.equal(fetchCount, 2);
});
