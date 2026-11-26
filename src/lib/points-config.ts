/**
 * 등기로 포인트(크레딧) 정책 설정
 *
 * 초기 운영 검증 단계에서는 이곳의 수치와 enforcement(차감 강제 여부)를
 * 손쉽게 조정하면서 UI 흐름과 사용자 반응을 확인할 수 있습니다.
 */
export const POINTS_CONFIG = {
  /** true이면 잔액 부족 시 열람/구독을 실제로 차단, false이면 UI 흐름 확인용으로 경고만 표시 */
  enforceBalance: false,
  /** 신규 가입 웰컴 포인트 */
  welcomeBonus: 100,
  /** 신규/최신 등기 PDF 1건 공유 시 적립 포인트 */
  uploadReward: 100,
  /** 타인이 공유한 등기 PDF 1건 열람 시 차감 포인트 */
  viewCost: 30,
  /** 관심 부동산 1건 변동 알림 구독 시 차감 포인트 (월 기준 안내) */
  monitorCost: 50,
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
  upload_reward: '등기 PDF 공유 적립',
  document_view: '공유 등기 PDF 열람',
  monitor_subscribe: '변동 알림 구독',
  adjustment: '포인트 조정',
};

export function formatPoints(amount: number): string {
  const sign = amount > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('ko-KR').format(amount)}${POINTS_CONFIG.unit}`;
}
