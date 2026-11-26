import assert from 'node:assert/strict';
import test from 'node:test';
import { maskOwnerName, maskResidentNumbers, parseKoreanRegistryText } from '../src/lib/registry-parser.ts';

test('주민등록번호와 개인 소유자 성명을 자동으로 마스킹하고 법인명은 보존한다', () => {
  const { masked, count } = maskResidentNumbers('소유자 김현준 900101-1234567 서울특별시');
  assert.equal(count, 1);
  assert.equal(masked, '소유자 김현준 900101-******* 서울특별시');
  assert.equal(maskOwnerName('김현준').name, '김*준');
  assert.equal(maskOwnerName('이수').name, '이*');
  assert.equal(maskOwnerName('주식회사 국민은행').name, '주식회사 국민은행');
});

test('실제 인터넷등기소 형식의 텍스트에서 고유번호, 표제부, 갑구, 을구, 위험 키워드를 추출한다', () => {
  const sampleText = `
    등기사항전부증명서(말소사항 포함)
    고유번호 1146-2019-012345
    [집합건물] 서울특별시 강남구 역삼동 858 제101동 제12층 제1201호
    표제부 (전유부분의 건물의 표시)
    철근콘크리트구조 84.92㎡
    갑 구 (소유권에 관한 사항)
    1 소유권이전 2023년5월12일 매매 소유자 김현준 900101-1234567 서울특별시 강남구
    을 구 (소유권 이외의 권리에 관한 사항)
    1 근저당권설정 채권최고액 금320,000,000원 근저당권자 주식회사 국민은행
    열람일시 : 2026년 11월 25일 14시 20분 10초
  `;
  const parsed = parseKoreanRegistryText(sampleText);
  assert.equal(parsed.registryUniqueNo, '1146-2019-012345');
  assert.equal(parsed.propertyType, '집합건물');
  assert.equal(parsed.unitName, '1201호');
  assert.equal(parsed.structure, '철근콘크리트구조');
  assert.equal(parsed.areaText, '전용 84.92㎡');
  assert.equal(parsed.ownerMasked, '김*준');
  assert.equal(parsed.ownershipCause, '매매 · 2023-05-12');
  assert.equal(parsed.mortgageAmount, 320000000);
  assert.equal(parsed.creditor, '주식회사 국민은행');
  assert.equal(parsed.issuedAt, '2026-11-25T14:20:00+09:00');
  assert.ok(parsed.maskedPiiCount >= 2);
});

test('을구 기록사항 없음과 가압류 위험 키워드를 정확히 구분한다', () => {
  const cleanText = `
    고유번호 1101-2020-000111
    [건물] 서울특별시 중구 세종대로 110
    갑 구
    1 소유권보존 2020년3월15일 소유권보존 소유자 주식회사 등기로
    을 구
    기록사항 없음
  `;
  const clean = parseKoreanRegistryText(cleanText);
  assert.equal(clean.mortgageAmount, null);
  assert.equal(clean.ownerMasked, '주식회사 등기로');
  assert.deepEqual(clean.riskFlags, []);

  const risky = parseKoreanRegistryText(cleanText + '\n가압류 등기');
  assert.deepEqual(risky.riskFlags, ['가압류']);
  assert.equal(risky.exposedRrnCount, 0);
});

test('주민등록번호 13자리 노출 여부(exposedRrnCount)와 미공개 마스킹 PDF를 구분한다', () => {
  const maskedPdf = parseKoreanRegistryText('고유번호 1101-2024-000001\n갑구\n소유자 김현준 900101-*******');
  assert.equal(maskedPdf.exposedRrnCount, 0);

  const exposedPdf = parseKoreanRegistryText('고유번호 1101-2024-000001\n갑구\n소유자 김현준 900101-1234567');
  assert.equal(exposedPdf.exposedRrnCount, 1);
});
