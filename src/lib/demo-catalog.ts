export interface RegistryProperty {
  id: string;
  registryUniqueNo: string;
  address: string;
  buildingName: string;
  unitName: string;
  propertyType: '집합건물' | '건물' | '토지';
  areaText: string;
  structure: string;
}

export interface RegistryDocumentItem {
  id: string;
  propertyId: string;
  issuedAt: string;
  createdAt: string;
  ownerMasked: string;
  ownershipCause: string;
  mortgageAmount: number | null;
  creditor: string;
  rankLabel: string;
  riskFlags: string[];
  pdfUrl: string | null;
  originalFilename: string;
  source: 'supabase' | 'demo';
  uploadedByMe?: boolean;
}

export interface WatchItem {
  targetId: string;
  memo: string;
  notifyChannel: 'in_app' | 'kakao' | 'sms';
  createdAt: string;
  status: 'normal' | 'received' | 'completed' | 'failed';
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  needsUpdate: boolean;
}

export interface AlertItem {
  id: string;
  propertyId: string;
  title: string;
  kind: 'received' | 'completed';
  message: string;
  createdAt: string;
  read: boolean;
}

export interface PointLedgerItem {
  id: string;
  delta: number;
  reason: 'welcome' | 'upload_reward' | 'document_view' | 'monitor_subscribe' | 'adjustment';
  refId?: string;
  note: string;
  createdAt: string;
}

export const DEMO_PROPERTIES: RegistryProperty[] = [
  {
    id: 'iros:1101-2024-004128',
    registryUniqueNo: '1101-2024-004128',
    address: '서울특별시 강남구 강남대로 396',
    buildingName: '테헤란 오피스텔',
    unitName: '1201호',
    propertyType: '집합건물',
    areaText: '전용 48.2㎡',
    structure: '철근콘크리트구조',
  },
  {
    id: 'iros:1102-2024-019204',
    registryUniqueNo: '1102-2024-019204',
    address: '서울특별시 서초구 신반포로11길 40',
    buildingName: '반포 리버아파트',
    unitName: '1503호',
    propertyType: '집합건물',
    areaText: '전용 84.98㎡',
    structure: '철근콘크리트구조',
  },
  {
    id: 'iros:1103-2023-088512',
    registryUniqueNo: '1103-2023-088512',
    address: '서울특별시 영등포구 여의공원로 68',
    buildingName: '여의도 금융오피스',
    unitName: '1402호',
    propertyType: '집합건물',
    areaText: '전용 105.2㎡',
    structure: '철골철근콘크리트구조',
  },
  {
    id: 'iros:1104-2024-051099',
    registryUniqueNo: '1104-2024-051099',
    address: '서울특별시 송파구 올림픽로 300',
    buildingName: '잠실 시그니처',
    unitName: '2104호',
    propertyType: '집합건물',
    areaText: '전용 98.4㎡',
    structure: '철근콘크리트구조',
  },
  {
    id: 'iros:1105-2022-033817',
    registryUniqueNo: '1105-2022-033817',
    address: '서울특별시 강남구 영동대로 513',
    buildingName: '삼성 업무빌딩',
    unitName: '',
    propertyType: '건물',
    areaText: '연면적 2,450.0㎡',
    structure: '철골철근콘크리트구조 · 지상 8층',
  },
  {
    id: 'iros:1106-2023-074201',
    registryUniqueNo: '1106-2023-074201',
    address: '서울특별시 성동구 아차산로 100',
    buildingName: '성수 리모델링빌딩',
    unitName: '',
    propertyType: '건물',
    areaText: '연면적 530.4㎡',
    structure: '근린생활시설 · 지상 4층',
  },
  {
    id: 'iros:1107-2024-011890',
    registryUniqueNo: '1107-2024-011890',
    address: '서울특별시 마포구 마포대로 92',
    buildingName: '공덕 파크뷰',
    unitName: '1102호',
    propertyType: '집합건물',
    areaText: '전용 59.95㎡',
    structure: '철근콘크리트구조',
  },
  {
    id: 'iros:1108-2024-062340',
    registryUniqueNo: '1108-2024-062340',
    address: '서울특별시 용산구 한강대로23길 55',
    buildingName: '용산 센트럴파크',
    unitName: '1602호',
    propertyType: '집합건물',
    areaText: '전용 92.3㎡',
    structure: '주상복합 · 철근콘크리트구조',
  },
  {
    id: 'iros:1109-2023-095411',
    registryUniqueNo: '1109-2023-095411',
    address: '서울특별시 양천구 목동서로 159-2',
    buildingName: '목동 하이페리온',
    unitName: '1902호',
    propertyType: '집합건물',
    areaText: '전용 108.4㎡',
    structure: '공동주택 · 철근콘크리트구조',
  },
  {
    id: 'iros:1110-2024-027650',
    registryUniqueNo: '1110-2024-027650',
    address: '서울특별시 강서구 마곡동로 161',
    buildingName: '마곡 테크타워',
    unitName: '1004호',
    propertyType: '집합건물',
    areaText: '전용 76.5㎡',
    structure: '지식산업센터 · 지상 14층',
  },
  {
    id: 'iros:1111-2024-044312',
    registryUniqueNo: '1111-2024-044312',
    address: '서울특별시 서초구 서초중앙로 157',
    buildingName: '서초 법조오피스',
    unitName: '502호',
    propertyType: '집합건물',
    areaText: '전용 74.1㎡',
    structure: '업무시설 · 지상 12층',
  },
  {
    id: 'iros:1112-2024-081905',
    registryUniqueNo: '1112-2024-081905',
    address: '서울특별시 강남구 테헤란로 156',
    buildingName: '역삼 타워',
    unitName: '804호',
    propertyType: '집합건물',
    areaText: '전용 62.4㎡',
    structure: '업무시설 · 철근콘크리트구조',
  },
];

export const DEMO_DOCUMENTS: RegistryDocumentItem[] = [
  {
    id: 'demo-doc-1',
    propertyId: 'iros:1101-2024-004128',
    issuedAt: '2026-11-24T10:15:00+09:00',
    createdAt: '2026-11-24T10:20:00+09:00',
    ownerMasked: '주식회사 테헤란자산',
    ownershipCause: '매매 · 2023-08-10',
    mortgageAmount: 320000000,
    creditor: '신한은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: [],
    pdfUrl: '/samples/gangnam-stn-base.pdf',
    originalFilename: '강남대로396_1201호_등기부등본.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-2',
    propertyId: 'iros:1102-2024-019204',
    issuedAt: '2026-11-25T14:30:00+09:00',
    createdAt: '2026-11-25T14:35:00+09:00',
    ownerMasked: '김*수',
    ownershipCause: '매매 · 2024-05-03',
    mortgageAmount: 650000000,
    creditor: '국민은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: [],
    pdfUrl: '/samples/banpo-park-base.pdf',
    originalFilename: '반포리버아파트_1503호_등기부등본.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-3',
    propertyId: 'iros:1103-2023-088512',
    issuedAt: '2026-11-23T09:10:00+09:00',
    createdAt: '2026-11-23T09:15:00+09:00',
    ownerMasked: '여의도인베스트(주)',
    ownershipCause: '매매 · 2023-06-30',
    mortgageAmount: 620000000,
    creditor: '신한은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: [],
    pdfUrl: '/samples/yeouido-park-base.pdf',
    originalFilename: '여의도금융오피스_1402호.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-4',
    propertyId: 'iros:1104-2024-051099',
    issuedAt: '2026-11-22T16:40:00+09:00',
    createdAt: '2026-11-22T16:45:00+09:00',
    ownerMasked: '잠실홀딩스(주)',
    ownershipCause: '분양 · 2023-11-20',
    mortgageAmount: 780000000,
    creditor: '하나은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: [],
    pdfUrl: '/samples/jamsil-tower-base.pdf',
    originalFilename: '잠실시그니처_2104호.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-5',
    propertyId: 'iros:1105-2022-033817',
    issuedAt: '2026-11-20T11:05:00+09:00',
    createdAt: '2026-11-20T11:10:00+09:00',
    ownerMasked: '삼성자산운용(주)',
    ownershipCause: '매매 · 2022-03-22',
    mortgageAmount: 1850000000,
    creditor: '한국산업은행',
    rankLabel: '근저당권 (2건)',
    riskFlags: [],
    pdfUrl: '/samples/coex-base.pdf',
    originalFilename: '삼성업무빌딩_등기부등본.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-6',
    propertyId: 'iros:1106-2023-074201',
    issuedAt: '2026-11-21T15:20:00+09:00',
    createdAt: '2026-11-21T15:25:00+09:00',
    ownerMasked: '성수디벨롭먼트(주)',
    ownershipCause: '매매 · 2023-07-19',
    mortgageAmount: 1120000000,
    creditor: '우리은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: ['신탁'],
    pdfUrl: '/samples/seongsu-stn-base.pdf',
    originalFilename: '성수리모델링빌딩_등기부등본.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-7',
    propertyId: 'iros:1107-2024-011890',
    issuedAt: '2026-11-25T09:50:00+09:00',
    createdAt: '2026-11-25T09:55:00+09:00',
    ownerMasked: '이*영',
    ownershipCause: '매매 · 2024-03-14',
    mortgageAmount: 290000000,
    creditor: '신한은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: [],
    pdfUrl: '/samples/gongdeok-base.pdf',
    originalFilename: '공덕파크뷰_1102호.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-8',
    propertyId: 'iros:1108-2024-062340',
    issuedAt: '2026-11-19T13:10:00+09:00',
    createdAt: '2026-11-19T13:15:00+09:00',
    ownerMasked: '용산프라퍼티(주)',
    ownershipCause: '매매 · 2023-10-12',
    mortgageAmount: 720000000,
    creditor: '국민은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: [],
    pdfUrl: '/samples/yongsan-stn-base.pdf',
    originalFilename: '용산센트럴파크_1602호.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-9',
    propertyId: 'iros:1109-2023-095411',
    issuedAt: '2026-11-18T17:00:00+09:00',
    createdAt: '2026-11-18T17:05:00+09:00',
    ownerMasked: '박*준',
    ownershipCause: '매매 · 2022-12-19',
    mortgageAmount: 480000000,
    creditor: '하나은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: [],
    pdfUrl: '/samples/mokdong-base.pdf',
    originalFilename: '목동하이페리온_1902호.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-10',
    propertyId: 'iros:1110-2024-027650',
    issuedAt: '2026-11-24T11:45:00+09:00',
    createdAt: '2026-11-24T11:50:00+09:00',
    ownerMasked: '마곡바이오(주)',
    ownershipCause: '분양 · 2023-06-15',
    mortgageAmount: 390000000,
    creditor: '기업은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: [],
    pdfUrl: '/samples/magok-park-base.pdf',
    originalFilename: '마곡테크타워_1004호.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-11',
    propertyId: 'iros:1111-2024-044312',
    issuedAt: '2026-11-21T10:05:00+09:00',
    createdAt: '2026-11-21T10:10:00+09:00',
    ownerMasked: '법무법인 서초',
    ownershipCause: '매매 · 2022-07-04',
    mortgageAmount: 280000000,
    creditor: '우리은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: [],
    pdfUrl: '/samples/seocho-court-base.pdf',
    originalFilename: '서초법조오피스_502호.pdf',
    source: 'demo',
  },
  {
    id: 'demo-doc-12',
    propertyId: 'iros:1112-2024-081905',
    issuedAt: '2026-11-25T16:15:00+09:00',
    createdAt: '2026-11-25T16:20:00+09:00',
    ownerMasked: '역삼벤처스(주)',
    ownershipCause: '매매 · 2024-01-11',
    mortgageAmount: 410000000,
    creditor: '우리은행',
    rankLabel: '근저당권 (1건)',
    riskFlags: [],
    pdfUrl: '/samples/yeoksam-base.pdf',
    originalFilename: '역삼타워_804호.pdf',
    source: 'demo',
  },
];

export function formatKoreanMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '근저당 없음';
  const eok = Math.floor(value / 100000000);
  const man = Math.floor((value % 100000000) / 10000);
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man > 0) parts.push(`${man.toLocaleString('ko-KR')}만`);
  return parts.length > 0 ? `${parts.join(' ')}원` : `${value.toLocaleString('ko-KR')}원`;
}

export function formatKstDateTime(value: string | null | undefined): string {
  if (!value) return '확인 이력 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
