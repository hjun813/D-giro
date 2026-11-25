import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBuildingLedgerApi,
  createMolitLedgerProvider,
  normalizeTitleItems,
  normalizeUnitItems,
  parseParcelParams,
} from '../building-ledger.js';

async function invoke(api, url, method = 'GET') {
  const path = url.split('?')[0];
  const result = {};
  await api(
    { method, url },
    {
      writeHead(status) { result.status = status; },
      end(body) { result.body = body ? JSON.parse(body) : null; },
    },
    path,
  );
  return result;
}

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
  assert.equal(parseParcelParams(new URLSearchParams({ sigunguCd: '11680', bjdongCd: '10100', bun: 'abc' })), null);
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
  assert.equal(titles[0].totalArea, 1240.5);
  assert.equal(titles[0].approvalDate, '2021-05-12');
  assert.deepEqual(normalizeTitleItems(''), []);

  const units = normalizeUnitItems({
    item: [
      { dongNm: '101동', hoNm: '1002호', exposPubuseGbCdNm: '전유', mainAtchGbCdNm: '주건축물', area: '84.9' },
      { dongNm: '101동', hoNm: '201호', exposPubuseGbCdNm: '전유', mainAtchGbCdNm: '주건축물', area: '59.8' },
      { dongNm: '101동', hoNm: '201호', exposPubuseGbCdNm: '공용', mainAtchGbCdNm: '주건축물', area: '24.1' },
      { dongNm: '101동', hoNm: '201호', exposPubuseGbCdNm: '전유', mainAtchGbCdNm: '부속건축물', area: '4.5' },
    ],
  });
  assert.deepEqual(units.map((u) => `${u.dong} ${u.ho}`), ['101동 201호', '101동 1002호']);
  assert.equal(units[0].exclusiveArea, 59.8);
});

test('인증키 미설정, 정상 조회 캐싱, 업스트림 오류를 명확히 구분한다', async () => {
  const unconfiguredApi = createBuildingLedgerApi(createMolitLedgerProvider({ serviceKey: '' }));
  const statusRes = await invoke(unconfiguredApi, '/api/building-ledger/status');
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.configured, false);
  const blocked = await invoke(unconfiguredApi, '/api/building-ledger?sigunguCd=11680&bjdongCd=10100&bun=858&ji=0');
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.status, 'unconfigured');

  let fetchCount = 0;
  const mockFetch = async (url) => {
    fetchCount += 1;
    const isTitle = url.includes('getBrTitleInfo');
    return {
      ok: true,
      async json() {
        return {
          response: {
            header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
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

  const api = createBuildingLedgerApi(createMolitLedgerProvider({ serviceKey: 'demo-key', fetchImpl: mockFetch }));
  assert.equal((await invoke(api, '/api/building-ledger?sigunguCd=bad')).status, 400);

  const first = await invoke(api, '/api/building-ledger?sigunguCd=11680&bjdongCd=10100&bun=858&ji=0');
  assert.equal(first.status, 200);
  assert.equal(first.body.status, 'ok');
  assert.equal(first.body.titles[0].buildingName, '강남빌딩');
  assert.equal(first.body.units[0].ho, '301호');
  assert.equal(first.body.cached, false);
  assert.equal(fetchCount, 2);

  const second = await invoke(api, '/api/building-ledger?sigunguCd=11680&bjdongCd=10100&bun=858&ji=0');
  assert.equal(second.status, 200);
  assert.equal(second.body.cached, true);
  assert.equal(fetchCount, 2);

  const failingApi = createBuildingLedgerApi(createMolitLedgerProvider({
    serviceKey: 'demo-key',
    fetchImpl: async () => ({ ok: false, status: 500 }),
  }));
  const failed = await invoke(failingApi, '/api/building-ledger?sigunguCd=11680&bjdongCd=10100&bun=858&ji=0');
  assert.equal(failed.status, 502);
  assert.equal(failed.body.status, 'error');
});
