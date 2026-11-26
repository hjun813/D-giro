const MOLIT_BASE_URL = 'https://apis.data.go.kr/1613000/BldRgstHubService';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

export interface ParcelParams {
  sigunguCd: string;
  bjdongCd: string;
  platGbCd: string;
  bun: string;
  ji: string;
  pnu: string;
}

export function parseParcelParams(searchParams: URLSearchParams): ParcelParams | null {
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

function asArray(items: any): any[] {
  const raw = items?.item ?? items;
  if (!raw || raw === '') return [];
  return Array.isArray(raw) ? raw : [raw];
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatDate(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 8) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function normalizeTitleItems(items: any) {
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

export function normalizeUnitItems(items: any) {
  const units: Array<{
    id: string;
    dong: string;
    ho: string;
    exclusiveArea: number | null;
    purpose: string;
    structure: string;
  }> = [];
  const seen = new Set<string>();
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

export function createMolitLedgerProvider({
  serviceKey = '',
  fetchImpl = fetch,
  timeoutMs = 8000,
}: {
  serviceKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}) {
  const key = String(serviceKey || '').trim();
  const cache = new Map<string, { expiresAt: number; data: any }>();

  async function callOperation(operation: string, parcel: ParcelParams, numOfRows: number) {
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
        const error: any = new Error(`MOLIT API HTTP ${response.status}`);
        error.code = 'UPSTREAM_HTTP';
        throw error;
      }
      const payload = await response.json();
      const resultCode = payload?.response?.header?.resultCode;
      if (resultCode && resultCode !== '00') {
        const error: any = new Error(payload?.response?.header?.resultMsg || `MOLIT API error ${resultCode}`);
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
    async lookup(parcel: ParcelParams) {
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
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }
      cache.set(parcel.pnu, { expiresAt: Date.now() + CACHE_TTL_MS, data });
      return { ...data, cached: false };
    },
  };
}

let sharedProvider: ReturnType<typeof createMolitLedgerProvider> | null = null;
export function getSharedLedgerProvider() {
  if (!sharedProvider) {
    sharedProvider = createMolitLedgerProvider({
      serviceKey: process.env.DATA_GO_KR_SERVICE_KEY,
    });
  }
  return sharedProvider;
}
