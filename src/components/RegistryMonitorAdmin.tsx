'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { formatKstDateTime } from '@/lib/demo-catalog';
import { MANUAL_RESULT_TEXT_LIMIT } from '@/lib/monitor/manual-check';
import type { MonitorCheckStatus } from '@/lib/monitor/types';

interface MonitorTarget {
  property_uid: string;
  location_label: string | null;
  subscriber_count: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_status: MonitorCheckStatus | null;
}

const checkStatus: Record<MonitorCheckStatus, string> = {
  ok: '확인 완료',
  failed: '조회 실패',
  rate_limited: '조회 제한',
  auth_required: '로그인 필요',
};

function currentKoreanTime() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export default function RegistryMonitorAdmin() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [targets, setTargets] = useState<MonitorTarget[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [selected, setSelected] = useState<MonitorTarget | null>(null);
  const [checkedAt, setCheckedAt] = useState('');
  const [rawText, setRawText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ q: query, after: cursor });
    setLoading(true);
    setListError('');

    async function load() {
      try {
        const response = await fetch(`/api/monitor/ingest?${params}`, { signal: abort.signal, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || '확인 대상을 불러오지 못했습니다.');
        setTargets(data.targets);
        setNextCursor(data.nextCursor);
      } catch (error) {
        if (!abort.signal.aborted) setListError(error instanceof Error ? error.message : '연결을 확인해 주세요.');
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => abort.abort();
  }, [query, cursor, refresh]);

  function selectTarget(target: MonitorTarget) {
    if (selected?.property_uid === target.property_uid) return;
    setSelected(target);
    setCheckedAt(currentKoreanTime());
    setRawText('');
    setConfirmed(false);
    setFeedback(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/monitor/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyUid: selected.property_uid, rawText, checkedAt, confirmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '조회 결과를 등록하지 못했습니다.');
      setRefresh((value) => value + 1);
      if (data.status !== 'ok') {
        setFeedback({ message: `${data.message} 조회 실패로 기록했으며 마지막 성공 결과는 유지됩니다.`, isError: true });
        return;
      }

      setFeedback({ message: data.baseline
        ? `첫 확인 결과 ${data.applicationCount}건을 저장했습니다. 기존 사건에 대한 알림은 생성하지 않았습니다.`
        : `새 변동 ${data.eventsCreated}건을 저장하고 앱 알림 ${data.notificationsCreated}건을 생성했습니다.` });
      setRawText('');
      setConfirmed(false);
      setCheckedAt(currentKoreanTime());
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : '연결을 확인해 주세요.', isError: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="registry-monitor-grid">
      <section className="card-panel" aria-labelledby="monitor-targets-title" aria-busy={loading}>
        <div className="panel-head"><h2 id="monitor-targets-title">확인 대상</h2></div>
        <form className="registry-monitor-search" onSubmit={(event) => { event.preventDefault(); setCursor(''); setQuery(search.trim()); setRefresh((value) => value + 1); }}>
          <input className="inline-memo" aria-label="고유번호 또는 주소" placeholder="고유번호 또는 주소" value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} />
          <button className="btn btn-secondary" type="submit" disabled={loading}>검색</button>
        </form>
        {loading && <p role="status">확인 대상을 불러오는 중입니다.</p>}
        {!loading && listError && <p role="alert">{listError}</p>}
        {!loading && !listError && (targets.length ? (
          <ul className="registry-monitor-targets">
            {targets.map((target) => (
              <li key={target.property_uid}>
                <button className="registry-monitor-target" type="button" disabled={saving} aria-pressed={selected?.property_uid === target.property_uid} onClick={() => selectTarget(target)}>
                  <span><strong>{target.property_uid}</strong>{target.location_label && <small>{target.location_label}</small>}</span>
                  <span><small>{target.subscriber_count}명 · {target.last_status ? checkStatus[target.last_status] : '확인 대기'}</small>
                    {target.last_attempt_at && <small>최근 시도 {formatKstDateTime(target.last_attempt_at)}</small>}
                    {target.last_status && target.last_status !== 'ok' && target.last_success_at && <small>마지막 성공 {formatKstDateTime(target.last_success_at)}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p>조건에 맞는 관심 등록이 없습니다.</p>)}
        {!loading && !listError && (cursor || nextCursor) && (
          <div className="registry-monitor-search">
            {cursor && <button className="btn btn-secondary" type="button" onClick={() => setCursor('')}>첫 페이지</button>}
            {nextCursor && <button className="btn btn-secondary" type="button" onClick={() => setCursor(nextCursor)}>다음 페이지</button>}
          </div>
        )}
      </section>

      <section className="card-panel" aria-labelledby="monitor-result-title">
        <div className="panel-head"><h2 id="monitor-result-title">신청사건 조회 결과</h2></div>
        {selected ? (
          <form className="registry-monitor-form" onSubmit={submit}>
            <div>
              <strong>{selected.property_uid}</strong>
              {selected.location_label && <div className="cell-sub">{selected.location_label}</div>}
            </div>
            <a href="https://www.iros.go.kr/" target="_blank" rel="noreferrer" className="btn btn-secondary">인터넷등기소 열기</a>
            <label>
              조회 시각 (한국 시간)
              <input className="inline-memo" type="datetime-local" value={checkedAt} onChange={(event) => setCheckedAt(event.target.value)} required disabled={saving} />
            </label>
            <label>
              조회 결과 또는 오류 메시지
              <textarea className="inline-memo" rows={9} value={rawText} maxLength={MANUAL_RESULT_TEXT_LIMIT} onChange={(event) => setRawText(event.target.value)} aria-describedby="monitor-copy-help" required disabled={saving} />
            </label>
            <small id="monitor-copy-help" className="cell-sub">신청사건 결과 표나 화면에 표시된 조회 결과 문구를 복사해 주세요. 성명이나 로그인 정보는 입력하지 마세요.</small>
            <label className="registry-monitor-confirm">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required disabled={saving} />
              인터넷등기소에서 조회한 고유번호가 위 대상과 일치합니다.
            </label>
            <button className="btn btn-primary" type="submit" disabled={saving || !confirmed || !rawText.trim()}>
              {saving ? '등록 중…' : '조회 결과 등록'}
            </button>
            {feedback && <p role={feedback.isError ? 'alert' : 'status'}>{feedback.message}</p>}
          </form>
        ) : <p>목록에서 확인할 부동산을 선택해 주세요.</p>}
      </section>
    </div>
  );
}
