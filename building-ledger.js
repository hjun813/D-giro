const MOLIT_BASE_URL = 'https://apis.data.go.kr/1613000/BldRgstHubService';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

export function parseParcelParams(searchParams) {
  const sigunguCd = String(searchParams.get('sigunguCd') || '').trim();
  const bjdongCd = String(searchParams.get('bjdongCd') || '').trim();
  const platGbCd = String(searchParams.get('platGbCd') || '0').trim() || '0';
  const rawBun = String(searchParams.get('bun') || '').trim();
  const rawJi = String(searchParams.get('ji') || '0').trim() || '0';

  if (!/^\d{5}$/.test(sigunguCd) || !/^\d{5}$/.test(bjdongCd)) return null;
  if (!/^[012]$/.test(platGbCd)) return null;
  if (!/^\d{1,4}$/.test(rawBun) || !/^\d{1,4}$/.test(rawJi)) return null;

  const bun = rawBun.padStart(4, '0');
  const ji = rawJi.padStart(4, '0');
  const pnu = `${sigunguCd}${bjdongCd}${Number(platGbCd) + 1}${bun}${ji}`;
  return { sigunguCd, bjdongCd, platGbCd, bun, ji, pnu };
}

function asArray(items) {
  const raw = items?.item ?? items;
  if (!raw || raw === '') return [];
  return Array.isArray(raw) ? raw : [raw];
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 8) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function normalizeTitleItems(items) {
  return asArray(items).map((item) => ({
    buildingName: String(item.bldNm || '').trim(),
    dongName: String(item.dongNm || '').trim(),
    registerKind: String(item.regstrKindCdNm || '').trim(),
    mainPurpose: String(item.mainPurpsCdNm || item.etcPurps || '').trim(),
    structure: String(item.strctCdNm || item.etcStrct || '').trim(),
    totalArea: toNumber(item.totArea),
    plotArea: toNumber(item.platArea),
    groundFloors: toNumber(item.grndFlrCnt),
    undergroundFloors: toNumber(item.ugrndFlrCnt),
    householdCount: toNumber(item.hhldCnt),
    hoCount: toNumber(item.hoCnt),
    approvalDate: formatDate(item.useAprDay),
    newPlatPlc: String(item.newPlatPlc || '').trim(),
    platPlc: String(item.platPlc || '').trim(),
  }));
}

export function normalizeUnitItems(items) {
  const units = [];
  const seen = new Set();
  for (const item of asArray(items)) {
    const part = String(item.exposPubuseGbCdNm || '').trim();
    const kind = String(item.mainAtchGbCdNm || '').trim();
    if (part && part !== '전유') continue;
    if (kind && kind !== '주건축물') continue;
    const dong = String(item.dongNm || '').trim();
    const ho = String(item.hoNm || '').trim();
    if (!ho) continue;
    const key = `${dong}::${ho}`;
    if (seen.has(key)) continue;
    seen.add(key);
    units.push({
      id: `ledger:${dong || 'main'}:${ho}`,
      dong,
      ho,
      exclusiveArea: toNumber(item.area),
      purpose: String(item.mainPurpsCdNm || item.etcPurps || '').trim(),
      structure: String(item.strctCdNm || item.etcStrct || '').trim(),
    });
  }
  return units.sort((a, b) =>
    a.dong.localeCompare(b.dong, 'ko', { numeric: true }) ||
    a.ho.localeCompare(b.ho, 'ko', { numeric: true }));
}

export function createMolitLedgerProvider({ serviceKey = '', fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const key = String(serviceKey || '').trim();
  const cache = new Map();

  async function callOperation(operation, parcel, numOfRows) {
    const query = new URLSearchParams({
      serviceKey: key,
      sigunguCd: parcel.sigunguCd,
      bjdongCd: parcel.bjdongCd,
      platGbCd: parcel.platGbCd,
      bun: parcel.bun,
      ji: parcel.ji,
      numOfRows: String(numOfRows),
      pageNo: '1',
      _type: 'json',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${MOLIT_BASE_URL}/${operation}?${query.toString()}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const error = new Error(`MOLIT API HTTP ${response.status}`);
        error.code = 'UPSTREAM_HTTP';
        throw error;
      }
      const payload = await response.json();
      const resultCode = payload?.response?.header?.resultCode;
      if (resultCode && resultCode !== '00') {
        const error = new Error(payload?.response?.header?.resultMsg || `MOLIT API error ${resultCode}`);
        error.code = 'UPSTREAM_RESULT';
        throw error;
      }
      return payload?.response?.body?.items;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: 'molit-building-ledger',
    configured: Boolean(key),
    async lookup(parcel) {
      if (!key) return { status: 'unconfigured', provider: 'molit-building-ledger' };
      const cached = cache.get(parcel.pnu);
      if (cached && cached.expiresAt > Date.now()) {
        return { ...cached.data, cached: true };
      }

      const [titleRaw, unitRaw] = await Promise.all([
        callOperation('getBrTitleInfo', parcel, 30),
        callOperation('getBrExposPubuseAreaInfo', parcel, 100),
      ]);
      const titles = normalizeTitleItems(titleRaw);
      const units = normalizeUnitItems(unitRaw);
      const data = {
        status: titles.length || units.length ? 'ok' : 'empty',
        provider: 'molit-building-ledger',
        fetchedAt: new Date().toISOString(),
        parcel,
        titles,
        units,
      };
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(parcel.pnu, { expiresAt: Date.now() + CACHE_TTL_MS, data });
      return { ...data, cached: false };
    },
  };
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

export function createBuildingLedgerApi(provider) {
  return async function buildingLedgerApi(request, response, path) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (path === '/api/building-ledger/status') {
      return sendJson(response, 200, {
        configured: provider.configured,
        provider: provider.name,
      });
    }
    if (path !== '/api/building-ledger') {
      return sendJson(response, 404, { message: '요청한 기능을 찾을 수 없어요.' });
    }
    if (!provider.configured) {
      return sendJson(response, 503, {
        status: 'unconfigured',
        provider: provider.name,
        message: '공공데이터포털 건축물대장 인증키(DATA_GO_KR_SERVICE_KEY)가 설정되지 않았어요.',
      });
    }
    const url = new URL(request.url, 'http://localhost');
    const parcel = parseParcelParams(url.searchParams);
    if (!parcel) {
      return sendJson(response, 400, {
        status: 'invalid',
        message: '조회할 주소의 법정동코드와 지번(본번·부번)을 확인해 주세요.',
      });
    }
    try {
      const result = await provider.lookup(parcel);
      return sendJson(response, 200, result);
    } catch (error) {
      console.error('Building ledger lookup failed:', error.code || error.name);
      return sendJson(response, 502, {
        status: 'error',
        provider: provider.name,
        message: '건축물대장 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
      });
    }
  };
}
