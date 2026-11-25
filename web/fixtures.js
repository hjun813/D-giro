export const users = [
  { id: 'user-a', name: '테스트 사용자 A' },
  { id: 'user-b', name: '테스트 사용자 B' },
];

// Public landmarks anchor the live map. All linked registry targets are fictional.
export const locations = [
  {
    id: 'city-hall', name: '서울시청', area: '서울 중구 태평로', coordinates: [37.5663, 126.9784],
    addresses: ['세종대로 110', '태평로1가 31'], keywords: ['서울특별시청', '서울시청 본관', '시청'],
    subtitle: '집합건물 동·호수 구분', pin: [56, 44],
  },
  {
    id: 'museum', name: '서울시립미술관', area: '서울 중구 서소문동', coordinates: [37.5640, 126.9738],
    addresses: ['덕수궁길 61', '서소문동 37'], keywords: ['서소문본관', '서울시립미술관 서소문본관', '미술관'],
    subtitle: '가상 건물 등기', pin: [29, 62],
  },
  {
    id: 'park', name: '광화문광장', area: '서울 종로구 세종로', coordinates: [37.5726, 126.9769],
    addresses: ['세종대로 175', '세종로 1-68'], keywords: ['광화문'],
    subtitle: '가상 토지 등기', pin: [69, 24],
  },
  {
    id: 'seoul-station', name: '서울역', area: '서울 용산구 한강대로', coordinates: [37.5547, 126.9707],
    addresses: ['한강대로 405', '동자동 43-205'], keywords: ['서울역사', 'KTX서울역', '서울역 광장'],
    subtitle: '가상 오피스텔 동·호수', pin: [22, 82],
  },
  {
    id: 'myeongdong', name: '명동성당', area: '서울 중구 명동길', coordinates: [37.5633, 126.9873],
    addresses: ['명동길 74', '명동2가 1-1'], keywords: ['명동대성당', '명동'],
    subtitle: '가상 상가건물 등기', pin: [82, 58],
  },
  {
    id: 'cheonggye', name: '청계광장', area: '서울 종로구 서린동', coordinates: [37.5691, 126.9776],
    addresses: ['청계천로 1', '서린동 14-1'], keywords: ['청계천', '청계광장 소라탑'],
    subtitle: '가상 다가구·토지 비교', pin: [74, 38],
  },
];

export const targets = [
  { id: 'sample-unit-101', locationId: 'city-hall', type: '집합건물', building: '가상 101동', unit: '201호', areaText: '전용 84.92㎡', structure: '철근콘크리트구조' },
  { id: 'sample-unit-102', locationId: 'city-hall', type: '집합건물', building: '가상 101동', unit: '202호', areaText: '전용 84.92㎡', structure: '철근콘크리트구조' },
  { id: 'sample-unit-103', locationId: 'city-hall', type: '집합건물', building: '가상 101동', unit: '301호', areaText: '전용 59.84㎡', structure: '철근콘크리트구조' },
  { id: 'sample-building', locationId: 'museum', type: '건물', building: '가상 문화시설', areaText: '연면적 1,240.5㎡', structure: '철골철근콘크리트구조 · 지상 4층' },
  { id: 'sample-land', locationId: 'park', type: '토지', building: '가상 필지', areaText: '대지 512.0㎡', structure: '중심상업지역' },
  { id: 'sample-officetel-301', locationId: 'seoul-station', type: '집합건물', building: '가상 오피스텔 A동', unit: '301호', areaText: '전용 42.15㎡', structure: '철근콘크리트구조 · 업무시설' },
  { id: 'sample-officetel-302', locationId: 'seoul-station', type: '집합건물', building: '가상 오피스텔 A동', unit: '302호', areaText: '전용 42.15㎡', structure: '철근콘크리트구조 · 업무시설' },
  { id: 'sample-commercial-1', locationId: 'myeongdong', type: '건물', building: '가상 명동 상가동', areaText: '연면적 680.3㎡', structure: '근린생활시설 · 지상 5층' },
  { id: 'sample-multi-101', locationId: 'cheonggye', type: '건물', building: '가상 청계 다가구', areaText: '연면적 328.4㎡', structure: '단독주택(다가구) · 지상 3층' },
  { id: 'sample-cheonggye-land', locationId: 'cheonggye', type: '토지', building: '가상 청계 필지', areaText: '대지 245.8㎡', structure: '일반상업지역' },
];

export const targetLabel = (target) => [target.building, target.unit].filter(Boolean).join(' ');

export const samples = [
  { id: 'unit-base', targetId: 'sample-unit-101', name: '201호 기본 자료', format: 'PDF', issuedAt: '2026-11-10T01:00:00Z', owner: '가상 소유자 A', ownershipCause: '매매 · 2023-05-12', amount: 125000000, creditor: '가상 시중은행', rank: '제1순위' },
  { id: 'unit-old', targetId: 'sample-unit-101', name: '201호 이전 버전', format: 'PDF', issuedAt: '2026-11-03T02:00:00Z', owner: '가상 소유자 B', ownershipCause: '매매 · 2020-08-19', amount: 95000000, creditor: '가상 저축은행', rank: '제1순위' },
  { id: 'unit-new', targetId: 'sample-unit-101', name: '201호 완료 반영 자료', format: 'PDF', issuedAt: '2026-11-24T05:30:00Z', owner: '가상 소유자 A', ownershipCause: '매매 · 2023-05-12', amount: 150000000, creditor: '가상 시중은행', rank: '제1순위 변경', reflectedEvent: 'sample-unit-101:application-1' },
  { id: 'neighbor', targetId: 'sample-unit-102', name: '202호 기본 자료', format: '이미지', issuedAt: '2026-11-14T03:00:00Z', owner: '가상 소유자 C', ownershipCause: '상속 · 2021-11-04', amount: null },
  { id: 'unit-301-base', targetId: 'sample-unit-103', name: '301호 기본 자료', format: 'PDF', issuedAt: '2026-11-12T04:20:00Z', owner: '가상 소유자 F', ownershipCause: '매매 · 2024-02-20', amount: null },
  { id: 'unreadable', targetId: null, name: '식별할 수 없는 파일', format: '이미지' },
  { id: 'unmasked', targetId: 'sample-unit-102', name: '202호 검수 보류 자료', format: 'PDF', requiresReview: true },
  { id: 'building-base', targetId: 'sample-building', name: '건물 기본 자료', format: 'PDF', issuedAt: '2026-11-08T01:10:00Z', owner: '가상 소유자 D', ownershipCause: '소유권보존 · 2018-03-15', amount: null },
  { id: 'land-base', targetId: 'sample-land', name: '토지 기본 자료', format: '이미지', issuedAt: '2026-11-09T03:15:00Z', owner: '가상 소유자 E', ownershipCause: '매매 · 2019-07-01', amount: null },
  { id: 'officetel-301-base', targetId: 'sample-officetel-301', name: '오피스텔 301호 기본 자료', format: 'PDF', issuedAt: '2026-11-11T02:30:00Z', owner: '가상 법인 가', ownershipCause: '매매 · 2022-09-14', amount: 240000000, creditor: '가상 캐피탈', rank: '제1순위' },
  { id: 'officetel-301-old', targetId: 'sample-officetel-301', name: '오피스텔 301호 이전 버전', format: 'PDF', issuedAt: '2026-10-28T06:00:00Z', owner: '가상 소유자 G', ownershipCause: '분양 · 2019-12-03', amount: 180000000, creditor: '가상 시중은행', rank: '제1순위' },
  { id: 'officetel-301-new', targetId: 'sample-officetel-301', name: '오피스텔 301호 완료 반영 자료', format: 'PDF', issuedAt: '2026-11-24T06:10:00Z', owner: '가상 법인 가', ownershipCause: '매매 · 2022-09-14', amount: 270000000, creditor: '가상 캐피탈', rank: '제1순위 변경', reflectedEvent: 'sample-officetel-301:application-1' },
  { id: 'officetel-302-base', targetId: 'sample-officetel-302', name: '오피스텔 302호 기본 자료', format: '이미지', issuedAt: '2026-11-13T05:00:00Z', owner: '가상 소유자 H', ownershipCause: '매매 · 2024-06-11', amount: null },
  { id: 'commercial-base', targetId: 'sample-commercial-1', name: '명동 상가동 기본 자료', format: 'PDF', issuedAt: '2026-11-06T01:40:00Z', owner: '가상 법인 나', ownershipCause: '매매 · 2021-04-28', amount: 850000000, creditor: '가상 제일은행', rank: '제1순위' },
  { id: 'commercial-review', targetId: 'sample-commercial-1', name: '명동 상가동 검수 보류 자료', format: 'PDF', requiresReview: true },
  { id: 'multi-base', targetId: 'sample-multi-101', name: '청계 다가구 기본 자료', format: '이미지', issuedAt: '2026-11-14T01:20:00Z', owner: '가상 소유자 I', ownershipCause: '신축보존 · 2020-10-18', amount: 420000000, creditor: '가상 우리은행', rank: '제1순위' },
  { id: 'cheonggye-land-base', targetId: 'sample-cheonggye-land', name: '청계 필지 기본 자료', format: 'PDF', issuedAt: '2026-11-07T04:00:00Z', owner: '가상 소유자 J', ownershipCause: '증여 · 2022-01-25', amount: null },
];

export const sampleFilename = (sample) => `${sample.id}.${sample.format === 'PDF' ? 'pdf' : 'png'}`;

export const rounds = [
  { label: '기준 조회 · 새 변동 미감지', kind: 'no-change', at: '2026-11-23T00:00:00Z' },
  { label: '등기신청 접수', kind: 'received', at: '2026-11-23T03:00:00Z' },
  { label: '등기 완료', kind: 'completed', at: '2026-11-23T07:00:00Z' },
  { label: '같은 완료 응답 재수신', kind: 'completed', at: '2026-11-24T00:00:00Z' },
  { label: '변동 조회 실패', kind: 'failure', at: '2026-11-24T03:00:00Z' },
  { label: '이전 접수 응답 지연 도착', kind: 'received', at: '2026-11-24T07:00:00Z' },
];
