import type { RegistryMonitorProvider } from '../types.ts';
import { MockMonitorProvider } from './mock-provider.ts';

export type MonitorProviderKind = 'mock' | 'deunggigo' | 'apick' | 'hyphen' | 'coocon';

/**
 * 환경 변수 또는 지정 키에 따라 변동 조회 공급처 어댑터를 생성한다.
 * 검증·계약이 완료되지 않은 외부 공급처는 모의 응답으로 위장하지 않고 명시적으로 오류를 반환한다.
 */
export function createMonitorProvider(
  kind: MonitorProviderKind | string = process.env.REGISTRY_MONITOR_PROVIDER || 'mock',
): RegistryMonitorProvider {
  const normalized = String(kind || 'mock').trim().toLowerCase();

  if (normalized === 'mock') {
    return new MockMonitorProvider();
  }

  throw new Error(
    `외부 등기변동 공급처 어댑터('${normalized}')는 아직 계약·연동되지 않았습니다. ` +
      `docs/DECISIONS.md(D04) 확정 후 전용 어댑터를 구현해 등록해 주세요.`,
  );
}

export { MockMonitorProvider } from './mock-provider.ts';
