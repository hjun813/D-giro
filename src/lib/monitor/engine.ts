import { deduplicateWatchTargets, shouldPollTarget } from './scheduler.ts';
import type {
  DetectedChangeEvent,
  FanoutNotification,
  MonitorBatchSummary,
  MonitorTargetState,
  RegistryApplicationItem,
  RegistryMonitorProvider,
  WatchSubscription,
} from './types.ts';

export function applicationKey(item: Pick<RegistryApplicationItem, 'receiptDate' | 'receiptNo'>): string {
  return `${item.receiptDate}:${item.receiptNo}`;
}

export function indexApplications(
  applications: RegistryApplicationItem[],
): Record<string, RegistryApplicationItem> {
  const map: Record<string, RegistryApplicationItem> = {};
  for (const app of applications) {
    map[applicationKey(app)] = app;
  }
  return map;
}

/**
 * 직전 스냅샷과 신규 조회 결과를 비교해 변동 사건만 추출한다.
 * 동일한 응답이 반복 도착해도 중복 이벤트를 발행하지 않는다.
 */
export function diffApplications(
  previous: Record<string, Pick<RegistryApplicationItem, 'status'>>,
  current: RegistryApplicationItem[],
  propertyUid: string,
  provider: string,
  observedAt: string,
): DetectedChangeEvent[] {
  const events: DetectedChangeEvent[] = [];

  for (const app of current) {
    const key = applicationKey(app);
    const prev = previous[key];

    if (!prev) {
      events.push({
        propertyUid,
        eventKey: `${propertyUid}:${key}:${app.status === 'completed' ? 'completed' : 'received'}`,
        kind: app.status === 'completed' ? 'completed' : 'received',
        application: app,
        observedAt,
        provider,
      });
      continue;
    }

    if (prev.status !== app.status) {
      if (prev.status === 'completed') {
        // 이미 완료된 사건에 대한 지연·역행 응답은 무시해 상태를 보존한다.
        continue;
      }
      const kind = app.status === 'completed' ? 'completed' : 'status_changed';
      events.push({
        propertyUid,
        eventKey: `${propertyUid}:${key}:${app.status}`,
        kind,
        application: app,
        observedAt,
        provider,
      });
    }
  }

  return events;
}

export interface RunMonitorBatchParams {
  provider: RegistryMonitorProvider;
  subscriptions: WatchSubscription[];
  previousStates?: Record<string, MonitorTargetState>;
  now?: Date;
  holidays?: ReadonlySet<string>;
  /** true이면 영업시간/슬롯 조건을 무시하고 강제 1회 실행 (수동 검증/테스트용) */
  force?: boolean;
}

/**
 * 고유번호 중복 제거 → 평일 영업시간 차등 필터링 → 어댑터 조회 → Diff → 구독자 팬아웃 알림까지
 * 모니터링 배치 1회차를 수행한다.
 */
export async function runMonitorBatch(params: RunMonitorBatchParams): Promise<MonitorBatchSummary> {
  const {
    provider,
    subscriptions,
    previousStates = {},
    now = new Date(),
    holidays,
    force = false,
  } = params;

  const executedAt = now.toISOString();
  const uniqueTargets = deduplicateWatchTargets(subscriptions);
  const updatedStates: Record<string, MonitorTargetState> = { ...previousStates };
  const retryQueue: MonitorBatchSummary['retryQueue'] = [];
  const allEvents: DetectedChangeEvent[] = [];
  const allNotifications: FanoutNotification[] = [];

  let polledCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const target of uniqueTargets) {
    const prevState: MonitorTargetState = updatedStates[target.propertyUid] || {
      propertyUid: target.propertyUid,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastStatus: null,
      knownApplications: {},
    };

    if (!force) {
      const decision = shouldPollTarget(
        { tier: target.tier, lastSuccessAt: prevState.lastSuccessAt },
        now,
        holidays,
      );
      if (!decision.due) {
        skippedCount += 1;
        updatedStates[target.propertyUid] = prevState;
        continue;
      }
    }

    polledCount += 1;
    let result;
    try {
      result = await provider.checkApplications({
        propertyUid: target.propertyUid,
        ownerName: target.ownerName,
      });
    } catch (error) {
      result = {
        provider: provider.name,
        propertyUid: target.propertyUid,
        status: 'failed' as const,
        checkedAt: executedAt,
        applications: [],
        errorCode: 'PROVIDER_EXCEPTION',
        errorMessage: error instanceof Error ? error.message : '알 수 없는 조회 오류',
      };
    }

    // 조회 실패는 변동 미감지로 처리하지 않으며, 직전 성공 시각과 기존 스냅샷을 그대로 보존한다.
    if (result.status !== 'ok') {
      failedCount += 1;
      updatedStates[target.propertyUid] = {
        ...prevState,
        lastAttemptAt: result.checkedAt || executedAt,
        lastStatus: result.status,
      };
      retryQueue.push({
        propertyUid: target.propertyUid,
        status: result.status,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      continue;
    }

    const isBaseline = prevState.lastSuccessAt === null;
    const mergedKnown: Record<string, RegistryApplicationItem> = {
      ...prevState.knownApplications,
      ...indexApplications(result.applications),
    };

    updatedStates[target.propertyUid] = {
      propertyUid: target.propertyUid,
      lastAttemptAt: result.checkedAt || executedAt,
      lastSuccessAt: result.checkedAt || executedAt,
      lastStatus: 'ok',
      knownApplications: mergedKnown,
    };

    // 최초 기준 조회는 현재 상태를 스냅샷으로 저장하고 과거 이력 알림을 폭탄 발송하지 않는다.
    if (isBaseline) {
      continue;
    }

    const events = diffApplications(
      prevState.knownApplications,
      result.applications,
      target.propertyUid,
      result.provider,
      result.checkedAt || executedAt,
    );

    for (const event of events) {
      allEvents.push(event);
      for (const userId of target.subscribers) {
        allNotifications.push({
          id: `${userId}:${event.eventKey}`,
          userId,
          propertyUid: target.propertyUid,
          eventKey: event.eventKey,
          kind: event.kind,
          purpose: event.application.purpose,
          observedAt: event.observedAt,
        });
      }
    }
  }

  return {
    provider: provider.name,
    isMock: provider.isMock,
    executedAt,
    totalUniqueTargets: uniqueTargets.length,
    polledCount,
    skippedCount,
    failedCount,
    retryQueue,
    events: allEvents,
    notifications: allNotifications,
    updatedStates,
  };
}
