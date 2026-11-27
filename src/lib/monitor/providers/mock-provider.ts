import type {
  MonitorCheckRequest,
  MonitorCheckResult,
  MonitorCheckStatus,
  RegistryApplicationItem,
  RegistryMonitorProvider,
} from '../types.ts';

export interface MockScenarioResponse {
  status?: MonitorCheckStatus;
  applications?: RegistryApplicationItem[];
  errorCode?: string;
  errorMessage?: string;
  checkedAt?: string;
}

export class MockMonitorProvider implements RegistryMonitorProvider {
  readonly name = 'mock';
  readonly isMock = true;

  private readonly scenarios: Map<string, MockScenarioResponse[]>;
  private readonly cursor: Map<string, number> = new Map();
  public callCount = 0;

  constructor(scenarios: Record<string, MockScenarioResponse[]> = {}) {
    this.scenarios = new Map(Object.entries(scenarios));
  }

  async checkApplications(input: MonitorCheckRequest): Promise<MonitorCheckResult> {
    this.callCount += 1;
    const queue = this.scenarios.get(input.propertyUid);
    const index = this.cursor.get(input.propertyUid) ?? 0;

    if (!queue || queue.length === 0) {
      return {
        provider: this.name,
        propertyUid: input.propertyUid,
        status: 'ok',
        checkedAt: new Date().toISOString(),
        applications: [],
      };
    }

    const picked = queue[Math.min(index, queue.length - 1)];
    this.cursor.set(input.propertyUid, index + 1);

    return {
      provider: this.name,
      propertyUid: input.propertyUid,
      status: picked.status ?? 'ok',
      checkedAt: picked.checkedAt ?? new Date().toISOString(),
      applications: picked.applications ?? [],
      errorCode: picked.errorCode,
      errorMessage: picked.errorMessage,
    };
  }
}
