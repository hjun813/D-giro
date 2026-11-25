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
];

export const targets = [
  { id: 'sample-unit-101', locationId: 'city-hall', type: '집합건물', building: '가상 101동', unit: '201호' },
  { id: 'sample-unit-102', locationId: 'city-hall', type: '집합건물', building: '가상 101동', unit: '202호' },
  { id: 'sample-building', locationId: 'museum', type: '건물', building: '가상 문화시설' },
  { id: 'sample-land', locationId: 'park', type: '토지', building: '가상 필지' },
];

export const targetLabel = (target) => [target.building, target.unit].filter(Boolean).join(' ');

export const samples = [
  { id: 'unit-base', targetId: 'sample-unit-101', name: '201호 기본 자료', format: 'PDF', issuedAt: '2026-11-10T01:00:00Z', owner: '가상 소유자 A', amount: 125000000 },
  { id: 'unit-old', targetId: 'sample-unit-101', name: '201호 이전 버전', format: 'PDF', issuedAt: '2026-11-03T02:00:00Z', owner: '가상 소유자 B', amount: 95000000 },
  { id: 'unit-new', targetId: 'sample-unit-101', name: '201호 완료 반영 자료', format: 'PDF', issuedAt: '2026-11-24T05:30:00Z', owner: '가상 소유자 A', amount: 150000000, reflectedEvent: 'sample-unit-101:application-1' },
  { id: 'neighbor', targetId: 'sample-unit-102', name: '202호 기본 자료', format: '이미지', issuedAt: '2026-11-14T03:00:00Z', owner: '가상 소유자 C', amount: null },
  { id: 'unreadable', targetId: null, name: '식별할 수 없는 파일', format: '이미지' },
  { id: 'unmasked', targetId: 'sample-unit-102', name: '202호 검수 보류 자료', format: 'PDF', requiresReview: true },
  { id: 'building-base', targetId: 'sample-building', name: '건물 기본 자료', format: 'PDF', issuedAt: '2026-11-08T01:10:00Z', owner: '가상 소유자 D', amount: null },
  { id: 'land-base', targetId: 'sample-land', name: '토지 기본 자료', format: '이미지', issuedAt: '2026-11-09T03:15:00Z', owner: '가상 소유자 E', amount: null },
];

export const rounds = [
  { label: '기준 조회 · 새 변동 미감지', kind: 'no-change', at: '2026-11-23T00:00:00Z' },
  { label: '등기신청 접수', kind: 'received', at: '2026-11-23T03:00:00Z' },
  { label: '등기 완료', kind: 'completed', at: '2026-11-23T07:00:00Z' },
  { label: '같은 완료 응답 재수신', kind: 'completed', at: '2026-11-24T00:00:00Z' },
  { label: '변동 조회 실패', kind: 'failure', at: '2026-11-24T03:00:00Z' },
  { label: '이전 접수 응답 지연 도착', kind: 'received', at: '2026-11-24T07:00:00Z' },
];
