import { normalizePropertyUid } from './scheduler.ts';
import type { ApplicationStatus, MonitorCheckResult, RegistryApplicationItem } from './types.ts';

const EMPTY_RESULT_PATTERN =
  /해당\s*등기\s*신청\s*사건이\s*존재하지\s*않습니다|조회된\s*(?:등기\s*신청\s*)?내역이\s*없습니다|검색\s*결과가\s*없습니다/;

const BLOCK_OR_CAPTCHA_PATTERN =
  /보안문자|자동입력\s*방지|CAPTCHA|과다\s*조회|조회\s*횟수\s*초과|일시적으로\s*제한|접근이\s*제한|이용이\s*제한|비정상적인\s*접근/i;

const AUTH_REQUIRED_PATTERN =
  /로그인이\s*필요|세션이\s*만료|다시\s*로그인|로그인\s*후\s*이용/;

export function normalizeApplicationStatus(raw: string): ApplicationStatus {
  const s = String(raw || '').replace(/\s+/g, '').trim();
  if (!s) return 'unknown';
  if (/^보정(?:완료|중|요구|명령|지시)?$/.test(s)) return 'correction';
  if (/^(?:각하|취하)(?:처리|완료)?$/.test(s)) return 'dismissed';
  if (/^(?:등기|처리)?완료$/.test(s)) return 'completed';
  if (/^(?:처리중|기입중|심사중|조사중|교합대기|진행중)$/.test(s)) return 'in_progress';
  if (/^(?:등기신청|신청서)?접수(?:완료)?$/.test(s)) return 'received';
  return 'unknown';
}

function normalizeReceiptDate(raw: string): string | null {
  const match = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : null;
}

/**
 * 인터넷등기소 '부동산 등기 신청사건 처리현황' 조회 결과 텍스트(또는 표 복사본)를 파싱한다.
 * - 보안문자·과다조회·차단 문구가 감지되면 우회하지 않고 즉시 `rate_limited`를 반환한다.
 * - 로그인 만료가 감지되면 즉시 `auth_required`를 반환한다.
 * - 형식을 알 수 없는 응답은 절대 '변동 없음(ok)'으로 처리하지 않고 `failed`를 반환한다.
 */
export function parseApplicationResultText(input: {
  propertyUid: string;
  rawText: string;
  provider?: string;
  checkedAt?: string;
}): MonitorCheckResult {
  const provider = input.provider || 'iros-manual-verify';
  const checkedAt = input.checkedAt || new Date().toISOString();
  const uid = normalizePropertyUid(input.propertyUid) || input.propertyUid;
  const text = String(input.rawText || '').replace(/\r\n/g, '\n').trim();

  if (!text) {
    return {
      provider,
      propertyUid: uid,
      status: 'failed',
      checkedAt,
      applications: [],
      errorCode: 'EMPTY_RESPONSE',
      errorMessage: '조회 응답 텍스트가 비어 있어 변동 여부를 판정할 수 없습니다.',
    };
  }

  if (BLOCK_OR_CAPTCHA_PATTERN.test(text)) {
    return {
      provider,
      propertyUid: uid,
      status: 'rate_limited',
      checkedAt,
      applications: [],
      errorCode: 'BLOCKED_OR_CAPTCHA',
      errorMessage: '보안문자 또는 조회 제한이 감지되었습니다. 인터넷등기소에서 다시 확인해 주세요.',
    };
  }

  if (AUTH_REQUIRED_PATTERN.test(text)) {
    return {
      provider,
      propertyUid: uid,
      status: 'auth_required',
      checkedAt,
      applications: [],
      errorCode: 'AUTH_REQUIRED',
      errorMessage: '인터넷등기소 로그인이 필요하거나 세션이 만료되었습니다.',
    };
  }

  const applications: RegistryApplicationItem[] = [];
  let unreadableRow = false;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    // 1) 탭 또는 파이프(|) 구분 표 행 파싱:
    // 예: 2026-11-27 | 10452 | 서울중앙지방법원 등기국 | 근저당권설정 | 접수
    // 또는: 2026.11.27\t10452\t가압류\t처리중
    const cols = line.includes('\t')
      ? line.split('\t').map((c) => c.trim()).filter(Boolean)
      : line.includes('|')
        ? line.split('|').map((c) => c.trim()).filter(Boolean)
        : null;

    if (cols && cols.length >= 4) {
      const dateIdx = cols.findIndex((c) => /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/.test(c));
      if (dateIdx >= 0) {
        const receiptDate = normalizeReceiptDate(cols[dateIdx]);
        const rest = cols.filter((_, idx) => idx !== dateIdx);
        const receiptNoIdx = rest.findIndex((c) => /^(?:제\s*)?\d{1,10}(?:\s*호)?$/.test(c));
        if (receiptDate && receiptNoIdx >= 0) {
          const receiptNo = rest[receiptNoIdx].replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
          const remaining = rest.filter((_, idx) => idx !== receiptNoIdx);
          const statusRaw = remaining.at(-1) || '';
          const status = normalizeApplicationStatus(statusRaw);
          if (status === 'unknown') {
            unreadableRow = true;
            continue;
          }
          const beforeStatus = remaining.slice(0, -1);
          const officeIdx = beforeStatus.findIndex((c) => /등기소|등기국|지방법원|지원/.test(c));
          const registryOffice = officeIdx >= 0 ? beforeStatus[officeIdx] : undefined;
          const purposeParts = beforeStatus.filter((_, idx) => idx !== officeIdx);
          const purpose = purposeParts.join(' ').trim() || '등기신청';

          applications.push({
            receiptDate,
            receiptNo,
            ...(registryOffice ? { registryOffice } : {}),
            purpose,
            status,
          });
          continue;
        }
      }
    }

    // 2) 공백 기반 단일 행 폴백:
    // 예: 2026-11-27 10452 근저당권설정 처리중
    const loose = line.match(
      /(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})\s+(?:제\s*)?(\d{1,10})(?:호)?\s+(.+?)\s+(접수|처리\s*중|기입\s*중|심사\s*중|조사\s*중|교합\s*대기|진행\s*중|보정|(?:등기\s*|처리\s*)?완료|각하|취하)\s*$/,
    );
    if (loose) {
      const receiptDate = normalizeReceiptDate(loose[1]);
      if (receiptDate) {
        applications.push({
          receiptDate,
          receiptNo: loose[2].replace(/^0+(?=\d)/, ''),
          purpose: loose[3].trim(),
          status: normalizeApplicationStatus(loose[4]),
        });
        continue;
      }
    }
    if (/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\s*(?:[|\t]\s*|\s+)(?:제\s*)?\d{1,10}/.test(line)) {
      unreadableRow = true;
    }
  }

  if (unreadableRow || (applications.length === 0 && !EMPTY_RESULT_PATTERN.test(text))) {
    return {
      provider,
      propertyUid: uid,
      status: 'failed',
      checkedAt,
      applications: [],
      errorCode: 'UNRECOGNIZED_RESPONSE',
      errorMessage: '신청사건 응답 형식을 해석하지 못해 안전을 위해 조회 실패로 처리했습니다.',
    };
  }

  return {
    provider,
    propertyUid: uid,
    status: 'ok',
    checkedAt,
    applications,
  };
}
