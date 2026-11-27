export type PollTier = 'standard' | 'intensive';

export type MonitorCheckStatus = 'ok' | 'failed' | 'rate_limited' | 'auth_required';

export type ApplicationStatus =
  | 'received'
  | 'in_progress'
  | 'correction'
  | 'completed'
  | 'dismissed'
  | 'unknown';

export interface RegistryApplicationItem {
  receiptDate: string; // YYYY-MM-DD
  receiptNo: string;
  registryOffice?: string;
  purpose: string;
  status: ApplicationStatus;
}

export interface MonitorCheckRequest {
  /** 정규화된 14자리 부동산 고유번호 (XXXX-XXXX-XXXXXX) */
  propertyUid: string;
  /** PDF 추출 또는 사용자 입력 소유자/신청인 성명 힌트 (공급처별 선택/필수) */
  ownerName?: string;
}

export interface MonitorCheckResult {
  provider: string;
  propertyUid: string;
  status: MonitorCheckStatus;
  checkedAt: string;
  applications: RegistryApplicationItem[];
  errorCode?: string;
  errorMessage?: string;
}

export interface RegistryMonitorProvider {
  readonly name: string;
  readonly isMock: boolean;
  checkApplications(input: MonitorCheckRequest): Promise<MonitorCheckResult>;
}

export interface WatchSubscription {
  userId: string;
  propertyUid: string;
  ownerName?: string;
  tier: PollTier;
  notifyChannel?: 'in_app' | 'kakao' | 'sms';
}

export interface DeduplicatedTarget {
  propertyUid: string;
  ownerName?: string;
  tier: PollTier;
  subscribers: string[];
}

export interface MonitorTargetState {
  propertyUid: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: MonitorCheckStatus | null;
  /** key: `${receiptDate}:${receiptNo}` */
  knownApplications: Record<string, RegistryApplicationItem>;
}

export type ChangeEventKind = 'received' | 'completed' | 'status_changed';

export interface DetectedChangeEvent {
  propertyUid: string;
  eventKey: string;
  kind: ChangeEventKind;
  application: RegistryApplicationItem;
  observedAt: string;
  provider: string;
}

export interface FanoutNotification {
  id: string;
  userId: string;
  propertyUid: string;
  eventKey: string;
  kind: ChangeEventKind;
  purpose: string;
  observedAt: string;
}

export interface MonitorBatchSummary {
  provider: string;
  isMock: boolean;
  executedAt: string;
  totalUniqueTargets: number;
  polledCount: number;
  skippedCount: number;
  failedCount: number;
  retryQueue: Array<{
    propertyUid: string;
    status: Exclude<MonitorCheckStatus, 'ok'>;
    errorCode?: string;
    errorMessage?: string;
  }>;
  events: DetectedChangeEvent[];
  notifications: FanoutNotification[];
  updatedStates: Record<string, MonitorTargetState>;
}
