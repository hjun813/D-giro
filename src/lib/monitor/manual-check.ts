import { applicationKey, diffApplications } from './engine.ts';
import { parseApplicationResultText } from './iros-parser.ts';
import { normalizePropertyUid } from './scheduler.ts';
import type { RegistryApplicationItem } from './types.ts';

export const MANUAL_RESULT_TEXT_LIMIT = 40_000;

export type ApplicationSnapshot = Record<string, Pick<RegistryApplicationItem, 'receiptDate' | 'receiptNo' | 'status'>>;

export function parseManualCheckTime(value: unknown, now = new Date()): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const time = new Date(`${value}:00+09:00`);
  if (!Number.isFinite(time.getTime()) || time > now) return null;
  const koreanTime = new Date(time.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
  return value === koreanTime ? time.toISOString() : null;
}

export function parseManualRegistryResult(propertyUid: string, rawText: string, checkedAt: string) {
  const labelledUids = rawText.matchAll(/(?:부동산\s*)?고유\s*번호[ \t]*[:：]?[ \t]*([0-9]{14}|[0-9]{4}[- ][0-9]{4}[- ][0-9]{6})(?![0-9])/g);
  for (const [, uid] of labelledUids) {
    if (normalizePropertyUid(uid) !== propertyUid) return null;
  }

  return parseApplicationResultText({ propertyUid, rawText, checkedAt, provider: 'iros-manual' });
}

export function projectManualRegistryResult(
  result: NonNullable<ReturnType<typeof parseManualRegistryResult>>,
  previous: ApplicationSnapshot,
  lastSuccessAt: string | null,
) {
  const knownApplications = { ...previous };
  if (result.status !== 'ok') return { baseline: false, knownApplications, events: [] };

  const current = new Map<string, RegistryApplicationItem>();
  for (const application of result.applications) {
    const { receiptDate, receiptNo, status } = application;
    const key = applicationKey(application);
    const previousStatus = knownApplications[key]?.status;
    if (previousStatus === 'completed' || (previousStatus === 'dismissed' && status !== 'completed')) continue;
    knownApplications[key] = { receiptDate, receiptNo, status };
    current.set(key, application);
  }

  const baseline = !lastSuccessAt;
  const events = baseline ? [] : diffApplications(
    previous,
    [...current.values()],
    result.propertyUid,
    result.provider,
    result.checkedAt,
  ).filter(({ kind, application }) => kind === 'completed' || (kind === 'received' && application.status === 'received'));

  return { baseline, knownApplications, events };
}
