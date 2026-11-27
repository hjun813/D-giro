import type { DeduplicatedTarget, PollTier, WatchSubscription } from './types.ts';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 평일 등기소 운영시간(09:00~18:00) 기준 차등 폴링 슬롯 (KST).
 * - standard: 마감 후 1일 1회 (18:30)
 * - intensive: 영업시간 1일 3회 (11:00, 15:00, 18:30)
 */
export const POLL_SLOTS_KST: Record<PollTier, readonly string[]> = {
  standard: ['18:30'],
  intensive: ['11:00', '15:00', '18:30'],
};

/**
 * 14자리 부동산 고유번호를 표준 형식(XXXX-XXXX-XXXXXX)으로 정규화한다.
 */
export function normalizePropertyUid(raw: string): string | null {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length !== 14) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 14)}`;
}

/**
 * 다수 회원의 관심 등록을 부동산 고유번호 단위로 중복 제거한다.
 * 동일 고유번호에 intensive 구독이 1건이라도 있으면 대상 티어를 intensive로 승격한다.
 */
export function deduplicateWatchTargets(subscriptions: WatchSubscription[]): DeduplicatedTarget[] {
  const byUid = new Map<string, DeduplicatedTarget>();

  for (const sub of subscriptions) {
    const uid = normalizePropertyUid(sub.propertyUid);
    if (!uid) continue;

    const existing = byUid.get(uid);
    const cleanedOwner = sub.ownerName?.trim() || undefined;

    if (!existing) {
      byUid.set(uid, {
        propertyUid: uid,
        ownerName: cleanedOwner,
        tier: sub.tier,
        subscribers: [sub.userId],
      });
      continue;
    }

    if (sub.tier === 'intensive') {
      existing.tier = 'intensive';
    }
    if (!existing.ownerName && cleanedOwner) {
      existing.ownerName = cleanedOwner;
    }
    if (!existing.subscribers.includes(sub.userId)) {
      existing.subscribers.push(sub.userId);
    }
  }

  return [...byUid.values()];
}

function toKstParts(date: Date): {
  dateStr: string;
  dayOfWeek: number;
  minutesOfDay: number;
} {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hours = kst.getUTCHours();
  const minutes = kst.getUTCMinutes();

  return {
    dateStr: `${year}-${month}-${day}`,
    dayOfWeek: kst.getUTCDay(), // 0: 일, 6: 토
    minutesOfDay: hours * 60 + minutes,
  };
}

function slotToMinutes(slot: string): number {
  const [h, m] = slot.split(':').map(Number);
  return h * 60 + m;
}

export function isKoreanBusinessDay(date: Date, holidays?: ReadonlySet<string>): boolean {
  const { dateStr, dayOfWeek } = toKstParts(date);
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  if (holidays?.has(dateStr)) return false;
  return true;
}

export interface PollDecision {
  due: boolean;
  slotKey: string | null;
  reason: 'non_business_day' | 'before_first_slot' | 'already_checked_in_slot' | 'due';
}

/**
 * 현재 시각(KST)과 직전 성공 시각을 비교해 이번 배치에서 조회 대상인지 판별한다.
 */
export function shouldPollTarget(
  target: { tier: PollTier; lastSuccessAt: string | null },
  now: Date,
  holidays?: ReadonlySet<string>,
): PollDecision {
  if (!isKoreanBusinessDay(now, holidays)) {
    return { due: false, slotKey: null, reason: 'non_business_day' };
  }

  const nowKst = toKstParts(now);
  const slots = POLL_SLOTS_KST[target.tier];

  let activeSlot: string | null = null;
  for (const slot of slots) {
    if (nowKst.minutesOfDay >= slotToMinutes(slot)) {
      activeSlot = slot;
    }
  }

  if (!activeSlot) {
    return { due: false, slotKey: null, reason: 'before_first_slot' };
  }

  const slotKey = `${nowKst.dateStr}T${activeSlot}+09:00`;
  const activeSlotMs = Date.parse(slotKey);

  if (target.lastSuccessAt) {
    const lastSuccessMs = Date.parse(target.lastSuccessAt);
    if (Number.isFinite(lastSuccessMs) && lastSuccessMs >= activeSlotMs) {
      return { due: false, slotKey, reason: 'already_checked_in_slot' };
    }
  }

  return { due: true, slotKey, reason: 'due' };
}
