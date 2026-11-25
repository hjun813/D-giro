import { rounds, samples, targets } from './fixtures.js';

const SNAPSHOT_VERSION = 1;
const STORAGE_KEY = 'deunggiro-mvp-v1';

export function initialState() {
  return {
    version: SNAPSHOT_VERSION,
    userId: 'user-a',
    documents: ['unit-base', 'building-base'].map((sampleId) => {
      const sample = samples.find((item) => item.id === sampleId);
      return { sampleId, targetId: sample.targetId, registeredAt: '2026-11-15T02:00:00Z' };
    }),
    submissions: [],
    watches: { 'user-a': [], 'user-b': [] },
    notifications: [],
    checks: {},
    events: {},
    round: 0,
    lastRound: null,
  };
}

export function loadState(storage) {
  try {
    const stored = JSON.parse(storage.getItem(STORAGE_KEY));
    if (stored?.version === SNAPSHOT_VERSION && Array.isArray(stored.documents) &&
        Array.isArray(stored.submissions) && Array.isArray(stored.notifications) &&
        Array.isArray(stored.watches?.[stored.userId]) && stored.checks && stored.events &&
        Number.isInteger(stored.round) && stored.round >= 0 && stored.round <= rounds.length) return stored;
  } catch {
    // The demo is usable in browser sessions with storage disabled.
  }
  return initialState();
}

export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // In-memory state still supports the complete demo for the current tab.
  }
}

export function documentsFor(state, targetId) {
  return state.documents.filter((document) => document.targetId === targetId)
    .map((document) => ({ ...samples.find((sample) => sample.id === document.sampleId), ...document }))
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

export function needsUpdate(state, targetId) {
  const event = state.events[targetId];
  const latest = documentsFor(state, targetId)[0];
  return Boolean(latest && event?.kind === 'completed' && latest.reflectedEvent !== event.id);
}

export function submitSample(state, userId, targetId, sampleId, at = new Date().toISOString()) {
  const sample = samples.find((item) => item.id === sampleId);
  if (!sample || !targets.some((target) => target.id === targetId)) return null;

  let status = 'published';
  if (sample.targetId === null) status = 'unreadable';
  else if (sample.targetId !== targetId) status = 'mismatch';
  else if (sample.requiresReview) status = 'review';
  else if (state.documents.some((document) => document.sampleId === sampleId)) status = 'duplicate';

  if (status === 'published') state.documents.push({ sampleId, targetId, registeredAt: at });
  const submission = { userId, targetId, sampleId, at, status };
  state.submissions.unshift(submission);
  return submission;
}

export function toggleWatch(state, userId, targetId) {
  const watched = state.watches[userId];
  const index = watched.indexOf(targetId);
  if (index === -1) {
    watched.push(targetId);
    return true;
  }
  watched.splice(index, 1);
  return false;
}

export function runRound(state) {
  const round = rounds[state.round];
  const targetIds = [...new Set(Object.values(state.watches).flat())];
  if (!round || targetIds.length === 0) return null;

  let newNotifications = 0;
  for (const targetId of targetIds) {
    const previousCheck = state.checks[targetId];
    const previousEvent = state.events[targetId];
    const lastSuccessAt = round.kind === 'failure' ? previousCheck?.lastSuccessAt : round.at;
    const eventKind = round.kind === 'received' || round.kind === 'completed';
    const advances = eventKind && previousEvent?.kind !== 'completed' && previousEvent?.kind !== round.kind;
    state.checks[targetId] = {
      at: round.at,
      lastSuccessAt: lastSuccessAt || null,
      outcome: advances || round.kind === 'failure' ? round.kind : 'no-change',
    };
    if (!advances) continue;

    const event = { id: `${targetId}:application-1`, kind: round.kind, at: round.at };
    state.events[targetId] = event;
    if (!previousCheck?.lastSuccessAt) continue;

    for (const [userId, watched] of Object.entries(state.watches)) {
      if (!watched.includes(targetId)) continue;
      const id = `${userId}:${event.id}:${event.kind}`;
      if (state.notifications.some((notification) => notification.id === id)) continue;
      state.notifications.unshift({ id, userId, targetId, kind: event.kind, at: round.at, read: false });
      newNotifications += 1;
    }
  }

  state.round += 1;
  state.lastRound = { label: round.label, count: targetIds.length, newNotifications, at: round.at };
  return state.lastRound;
}
