export interface ParsedRegistryDocument {
  registryUniqueNo: string | null;
  propertyType: '집합건물' | '건물' | '토지';
  address: string;
  buildingName: string;
  unitName: string;
  areaText: string;
  structure: string;
  issuedAt: string | null;
  ownerMasked: string;
  ownershipCause: string;
  mortgageAmount: number | null;
  creditor: string;
  rankLabel: string;
  riskFlags: string[];
  maskedPiiCount: number;
  exposedRrnCount: number;
}

const CORP_PATTERN = /(주식회사|\(주\)|㈜|유한회사|법인|재단|조합|은행|공사|신탁|캐피탈|저축|협회|위원회|대한민국|서울특별시|광역시|구청|시청)/;
const RISK_PATTERNS: Array<[string, RegExp]> = [
  ['가압류', /가압류/],
  ['압류', /(?<!가)압류/],
  ['경매개시결정', /경매개시결정/],
  ['강제경매', /강제경매/],
  ['임의경매', /임의경매/],
  ['신탁', /신탁/],
  ['임차권등기', /임차권등기/],
  ['가처분', /가처분/],
];

export function maskResidentNumbers(text: string): { masked: string; count: number } {
  let count = 0;
  const masked = text.replace(/(\d{6})[-\s]?([1-8]\d{6})/g, (_, front) => {
    count += 1;
    return `${front}-*******`;
  });
  return { masked, count };
}

export function maskOwnerName(rawName: string): { name: string; masked: boolean } {
  const cleaned = rawName.replace(/\s+/g, ' ').trim();
  if (!cleaned) return { name: '소유자 미확인', masked: false };
  if (CORP_PATTERN.test(cleaned)) return { name: cleaned, masked: false };
  if (/^[가-힣]{2,4}$/.test(cleaned)) {
    if (cleaned.length === 2) return { name: `${cleaned[0]}*`, masked: true };
    return { name: `${cleaned[0]}${'*'.repeat(cleaned.length - 2)}${cleaned.at(-1)}`, masked: true };
  }
  // If already contains asterisk or foreign/long name, mask middle chunk
  if (cleaned.includes('*')) return { name: cleaned, masked: false };
  if (cleaned.length > 3) {
    return { name: `${cleaned.slice(0, 2)}${'*'.repeat(Math.min(4, cleaned.length - 2))}`, masked: true };
  }
  return { name: cleaned, masked: false };
}

function parseKoreanDateTime(text: string): string | null {
  const full = text.match(/(?:열람일시|발급일시|출력일시)\s*[:：]?\s*(\d{4})[년.\-/]\s*(\d{1,2})[월.\-/]\s*(\d{1,2})[일]?\s*(\d{1,2})[시:]\s*(\d{1,2})/);
  if (full) {
    const [, y, m, d, hh, mm] = full;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00+09:00`;
  }
  const dateOnly = text.match(/(?:열람일시|발급일시|기준일)\s*[:：]?\s*(\d{4})[년.\-/]\s*(\d{1,2})[월.\-/]\s*(\d{1,2})/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T09:00:00+09:00`;
  }
  return null;
}

function parseAddressHeader(text: string): {
  propertyType: '집합건물' | '건물' | '토지';
  address: string;
  buildingName: string;
  unitName: string;
} {
  const headerMatch = text.match(/\[(집합건물|건물|토지)\]\s*([^\n\r]+)/);
  const propertyType = (headerMatch?.[1] as '집합건물' | '건물' | '토지') || (text.includes('전유부분') ? '집합건물' : text.includes('표제부') ? '건물' : '토지');
  let rawLine = (headerMatch?.[2] || '').replace(/\s+/g, ' ').trim();
  rawLine = rawLine.replace(/\s*(?:고유번호|표제부).*$/, '').trim();

  const dongMatch = rawLine.match(/(?:제?\s*(\d+동)|([가-힣A-Za-z0-9]+동))\s*(?=제?\s*\d+층|제?\s*\d+호|$)/);
  const hoMatch = rawLine.match(/제?\s*(\d{1,4}(?:-\d+)?호|지하?\d+호|B\d+호)/i);
  const unitName = hoMatch ? hoMatch[1] : '';
  const dongName = dongMatch ? (dongMatch[1] || dongMatch[2] || '') : '';

  const address = rawLine
    .replace(/\s*제?\s*\d+동/g, '')
    .replace(/\s*제?\s*\d+층/g, '')
    .replace(/\s*제?\s*\d{1,4}(?:-\d+)?호/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const buildingName = dongName || (address ? address.split(' ').slice(-2).join(' ') : '등기 대상');
  return { propertyType, address, buildingName, unitName };
}

function parseAreaAndStructure(text: string): { areaText: string; structure: string } {
  const structureMatch = text.match(/(철골철근콘크리트구조|철근콘크리트구조|철근콘크리트조|철골구조|벽돌구조|일반목구조|경량철골구조|시멘트벽돌조)/);
  const structure = structureMatch?.[1] || '';

  const areaMatches = [...text.matchAll(/(\d{1,5}(?:\.\d{1,4})?)\s*(?:㎡|m2|m²)/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n >= 5 && n <= 100000);
  const picked = areaMatches.length ? areaMatches[areaMatches.length - 1] : null;
  const areaText = picked !== null ? `${text.includes('전유부분') ? '전용' : '면적'} ${picked}㎡` : '';
  return { areaText, structure };
}

function parseGapgu(text: string): { ownerMasked: string; ownershipCause: string; maskedCount: number } {
  const gapStart = text.search(/갑\s*구|소유권에\s*관한\s*사항/);
  const eulStart = text.search(/을\s*구|소유권\s*이외의\s*권리/);
  const gapSection = gapStart >= 0
    ? text.slice(gapStart, eulStart > gapStart ? eulStart : undefined)
    : text;

  let maskedCount = 0;
  const ownerMatches = [...gapSection.matchAll(/소유자\s+([가-힣A-Za-z0-9()㈜.\s]{2,28}?)(?=\s+\d{6}[-\s]?[\d*]{7}|\s+지분|\s+[가-힣]+(?:특별시|광역시|도|시|군|구)|\n|\r|$)/g)];
  const rawOwner = ownerMatches.at(-1)?.[1]?.trim() || '';
  const { name: ownerMasked, masked } = maskOwnerName(rawOwner);
  if (masked) maskedCount += 1;

  const causeMatch = [...gapSection.matchAll(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(매매|상속|증여|분양|소유권보존|신탁|임의경매로\s*인한\s*매각|경매)/g)].at(-1);
  const ownershipCause = causeMatch
    ? `${causeMatch[4].replace(/\s+/g, ' ')} · ${causeMatch[1]}-${causeMatch[2].padStart(2, '0')}-${causeMatch[3].padStart(2, '0')}`
    : '';

  return { ownerMasked, ownershipCause, maskedCount };
}

function parseEulgu(text: string): { mortgageAmount: number | null; creditor: string; rankLabel: string } {
  const eulStart = text.search(/을\s*구|소유권\s*이외의\s*권리/);
  if (eulStart < 0) return { mortgageAmount: null, creditor: '', rankLabel: '' };
  const eulSection = text.slice(eulStart);
  if (/기록사항\s*없음/.test(eulSection)) {
    return { mortgageAmount: null, creditor: '', rankLabel: '' };
  }

  const amountMatches = [...eulSection.matchAll(/채권최고액\s*금?\s*([\d,]+)\s*원/g)];
  const rawAmount = amountMatches.at(-1)?.[1];
  const mortgageAmount = rawAmount ? Number(rawAmount.replace(/,/g, '')) : null;

  const creditorMatches = [...eulSection.matchAll(/근저당권자\s+([가-힣A-Za-z0-9()㈜.\s]{2,30}?)(?=\s+\d{6}[-\s]?[\d*]{7}|\s+[가-힣]+(?:특별시|광역시|도|시|군|구)|\n|\r|$)/g)];
  const rawCreditor = creditorMatches.at(-1)?.[1]?.trim() || '';
  const creditor = rawCreditor ? maskOwnerName(rawCreditor).name : '';
  const rankLabel = mortgageAmount ? `근저당권 (${amountMatches.length}건)` : '';

  return {
    mortgageAmount: Number.isFinite(mortgageAmount) && mortgageAmount > 0 ? mortgageAmount : null,
    creditor,
    rankLabel,
  };
}

export function parseKoreanRegistryText(rawText: string): ParsedRegistryDocument {
  const normalized = String(rawText || '').replace(/\r\n/g, '\n');
  const { masked: safeText, count: rrnCount } = maskResidentNumbers(normalized);

  const uniqueNoMatch = safeText.match(/(?:고유번호\s*[:：]?\s*)?(\d{4}-\d{4}-\d{6})/);
  const registryUniqueNo = uniqueNoMatch?.[1] || null;
  const { propertyType, address, buildingName, unitName } = parseAddressHeader(safeText);
  const { areaText, structure } = parseAreaAndStructure(safeText);
  const issuedAt = parseKoreanDateTime(safeText);
  const { ownerMasked, ownershipCause, maskedCount: ownerMaskedCount } = parseGapgu(safeText);
  const { mortgageAmount, creditor, rankLabel } = parseEulgu(safeText);
  const riskFlags = RISK_PATTERNS.filter(([, pattern]) => pattern.test(safeText)).map(([label]) => label);

  return {
    registryUniqueNo,
    propertyType,
    address,
    buildingName,
    unitName,
    areaText,
    structure,
    issuedAt,
    ownerMasked,
    ownershipCause,
    mortgageAmount,
    creditor,
    rankLabel,
    riskFlags,
    maskedPiiCount: rrnCount + ownerMaskedCount,
    exposedRrnCount: rrnCount,
  };
}
