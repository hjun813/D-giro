/**
 * 등기로 포인트(크레딧) 정책 설정
 *
 * - PDF 조회: 하루 10회 무료, 이후 건당 10P 차감
 * - 등기 공유(등록): 최신 등기에 한해 +100P 적립 (이전 시점 등기는 이력만 등록, 0P)
 * - 관심 등록 / 변동 알림: 단건(1건) 무료, 2건째부터 추가 건당 월 30P 차감
 */
export const POINTS_CONFIG = {
  /** true이면 잔액 부족 시 열람/구독을 실제로 차단, false이면 UI 흐름 확인용으로 경고만 표시 */
  enforceBalance: false,
  /** 신규 가입 웰컴 포인트 */
  welcomeBonus: 100,
  /** 최신 등기 PDF 1건 공유 시 적립 포인트 */
  uploadReward: 100,
  /** PDF 조회 하루 무료 횟수 */
  dailyFreeViews: 10,
  /** 하루 무료 조회 횟수 초과 시 건당 차감 포인트 */
  viewCost: 10,
  /** 관심 부동산(변동 알림) 무료 등록 가능 건수 */
  freeWatchlistCount: 1,
  /** 무료 건수 초과 시 추가 1건당 월 차감 포인트 */
  monitorCost: 30,
  /** 포인트 표기 단위 */
  unit: 'P',
} as const;

export type PointReason =
  | 'welcome'
  | 'upload_reward'
  | 'document_view'
  | 'monitor_subscribe'
  | 'adjustment';

export const POINT_REASON_LABELS: Record<PointReason, string> = {
  welcome: '가입 웰컴 포인트',
  upload_reward: '최신 등기 PDF 공유 적립',
  document_view: '공유 등기 PDF 조회',
  monitor_subscribe: '변동 알림 추가 구독',
  adjustment: '포인트 조정',
};

export function formatPoints(amount: number): string {
  if (amount === 0) return `0${POINTS_CONFIG.unit}`;
  const sign = amount > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('ko-KR').format(amount)}${POINTS_CONFIG.unit}`;
}

/** KST(Asia/Seoul) 기준 YYYY-MM-DD 날짜 키 반환 */
export function getKstDateKey(date: Date = new Date()): string {
  const kstMs = date.getTime() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10);
}

/** KST 기준 오늘 00:00:00 ~ 내일 00:00:00 의 UTC ISO 경계 */
export function getKstDayBounds(date: Date = new Date()): { dateKey: string; startIso: string; endIso: string } {
  const dateKey = getKstDateKey(date);
  const start = new Date(`${dateKey}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    dateKey,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

/**
 * 새로 등록하려는 등기 PDF가 해당 부동산의 기존 최신 등기보다 최신인지 판별.
 * - 기존 등기가 없으면 항상 최신(true)
 * - 기존 등기가 있을 때는 새 등기 발급시각이 엄격히 더 이후여야 최신(true)
 */
export function isNewerRegistryDocument(
  candidateIssuedAt: string | null | undefined,
  existingLatestIssuedAt: string | null | undefined,
): boolean {
  if (!existingLatestIssuedAt) return true;
  if (!candidateIssuedAt) return false;
  const candidateMs = Date.parse(candidateIssuedAt);
  const existingMs = Date.parse(existingLatestIssuedAt);
  if (Number.isNaN(candidateMs) || Number.isNaN(existingMs)) {
    return candidateIssuedAt > existingLatestIssuedAt;
  }
  return candidateMs > existingMs;
}

/**
 * 관심 등록(변동 알림) 신규 추가 시 과금 계산:
 * 단건(freeWatchlistCount=1) 무료, 초과 건수마다 월 monitorCost(30P) 차감
 */
export function calculateWatchlistCharge(existingCount: number, newlyAddedCount: number): {
  freeCount: number;
  paidCount: number;
  totalCost: number;
} {
  const safeExisting = Math.max(0, existingCount);
  const safeAdded = Math.max(0, newlyAddedCount);
  const freeRemaining = Math.max(0, POINTS_CONFIG.freeWatchlistCount - safeExisting);
  const freeCount = Math.min(safeAdded, freeRemaining);
  const paidCount = Math.max(0, safeAdded - freeCount);
  return {
    freeCount,
    paidCount,
    totalCost: paidCount * POINTS_CONFIG.monitorCost,
  };
}

/**
 * PDF 조회 과금 계산:
 * 본인 업로드/기열람 문서는 무료, 그 외 하루 10회 무료 후 건당 10P 차감
 */
export function calculatePdfViewCharge(
  todayViewCountBefore: number,
  isOwnOrAlreadyViewed: boolean,
): {
  isFree: boolean;
  cost: number;
  usedTodayAfter: number;
  freeRemainingAfter: number;
} {
  const safeBefore = Math.max(0, todayViewCountBefore);
  if (isOwnOrAlreadyViewed) {
    return {
      isFree: true,
      cost: 0,
      usedTodayAfter: safeBefore,
      freeRemainingAfter: Math.max(0, POINTS_CONFIG.dailyFreeViews - safeBefore),
    };
  }
  const usedTodayAfter = safeBefore + 1;
  if (safeBefore < POINTS_CONFIG.dailyFreeViews) {
    return {
      isFree: true,
      cost: 0,
      usedTodayAfter,
      freeRemainingAfter: Math.max(0, POINTS_CONFIG.dailyFreeViews - usedTodayAfter),
    };
  }
  return {
    isFree: false,
    cost: POINTS_CONFIG.viewCost,
    usedTodayAfter,
    freeRemainingAfter: 0,
  };
}
