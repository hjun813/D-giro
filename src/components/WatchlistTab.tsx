'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  formatKstDateTime,
  type RegistryDocumentItem,
  type RegistryProperty,
  type WatchItem,
} from '@/lib/demo-catalog';
import { POINTS_CONFIG } from '@/lib/points-config';

interface WatchlistTabProps {
  properties: RegistryProperty[];
  documents: RegistryDocumentItem[];
  watchlist: WatchItem[];
  canManageMonitor: boolean;
  usesSavedMonitoring: boolean;
  onOpenPdf: (property: RegistryProperty, doc: RegistryDocumentItem) => void;
  onRemoveWatch: (targetId: string) => void;
  onUpdateWatchMeta: (
    targetId: string,
    patch: { memo?: string; notifyChannel?: 'in_app' | 'kakao' | 'sms' },
    persist?: boolean,
  ) => void;
  onBulkAddWatch: (entries: Array<{ targetId: string; memo: string }>) => void;
  onRunMonitoringCheck: () => void;
  onGoSearch: () => void;
}

const CHANNEL_LABELS: Record<'in_app' | 'kakao' | 'sms', string> = {
  in_app: '앱 내 알림',
  kakao: '카카오 알림톡',
  sms: '문자(SMS)',
};

export default function WatchlistTab({
  properties,
  documents,
  watchlist,
  canManageMonitor,
  usesSavedMonitoring,
  onOpenPdf,
  onRemoveWatch,
  onUpdateWatchMeta,
  onBulkAddWatch,
  onRunMonitoringCheck,
  onGoSearch,
}: WatchlistTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'changed' | 'needs_update' | 'normal'>('all');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const propMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const latestDocMap = useMemo(() => {
    const map = new Map<string, RegistryDocumentItem>();
    for (const doc of documents) {
      const existing = map.get(doc.propertyId);
      if (!existing || (doc.issuedAt || '') > (existing.issuedAt || '')) {
        map.set(doc.propertyId, doc);
      }
    }
    return map;
  }, [documents]);

  const counts = useMemo(() => {
    let changed = 0;
    let needsUpdate = 0;
    let normal = 0;
    for (const item of watchlist) {
      if (item.status === 'received' || item.status === 'completed') changed += 1;
      if (item.needsUpdate) needsUpdate += 1;
      if (item.status === 'normal' && item.lastSuccessAt) normal += 1;
    }
    return { total: watchlist.length, changed, needsUpdate, normal };
  }, [watchlist]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return watchlist.filter((item) => {
      if (statusFilter === 'changed' && item.status !== 'received' && item.status !== 'completed') return false;
      if (statusFilter === 'needs_update' && !item.needsUpdate) return false;
      if (statusFilter === 'normal' && (item.status !== 'normal' || !item.lastSuccessAt)) return false;
      if (!q) return true;
      const prop = propMap.get(item.targetId);
      const hay = [
        item.targetId,
        item.memo,
        prop?.address || '',
        prop?.buildingName || '',
        prop?.unitName || '',
        prop?.registryUniqueNo || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [watchlist, statusFilter, search, propMap]);

  function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lines = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const entries = lines.map((line) => {
      const [rawKey, ...rest] = line.split(/[,\t]/);
      const key = rawKey.trim();
      const targetId = key.startsWith('iros:') ? key : `iros:${key}`;
      return { targetId, memo: rest.join(' ').trim() };
    });

    if (entries.length > 0) {
      onBulkAddWatch(entries);
      setBulkText('');
      setBulkOpen(false);
    }
  }

  function handleLoadSamplePortfolio() {
    const entries = properties.slice(0, 8).map((p, idx) => ({
      targetId: p.id,
      memo: idx === 0 ? '내 전세집' : `담보 관리 #${idx + 1}`,
    }));
    onBulkAddWatch(entries);
  }

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <h1>내 관리 물건 (등기변동 알림)</h1>
          <p>
            개인의 전세집 1건부터 금융권의 담보 물건 200건까지 한눈에 관리하고, 변동이 생기면 바로 알림을 받으세요.
          </p>
        </div>
        <div className="head-actions">
          {canManageMonitor && <Link href="/admin/monitor" className="btn btn-secondary">조회 결과 등록</Link>}
          <button type="button" className="btn btn-secondary" onClick={() => setBulkOpen((v) => !v)}>
            고유번호 일괄 등록
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={watchlist.length === 0}
            onClick={onRunMonitoringCheck}
          >
            {usesSavedMonitoring ? '확인 내역 새로고침' : '변동 확인 체험'}
          </button>
        </div>
      </section>

      <section className="kpi-grid">
        <button type="button" className={`kpi-card ${statusFilter === 'all' ? 'is-active' : ''}`} onClick={() => setStatusFilter('all')}>
          <span className="kpi-label">전체 관리 물건</span>
          <strong className="kpi-value">{counts.total}건</strong>
        </button>
        <button type="button" className={`kpi-card ${statusFilter === 'changed' ? 'is-active' : ''}`} onClick={() => setStatusFilter('changed')}>
          <span className="kpi-label">변동 감지</span>
          <strong className="kpi-value text-primary-accent">{counts.changed}건</strong>
        </button>
        <button type="button" className={`kpi-card ${statusFilter === 'needs_update' ? 'is-active' : ''}`} onClick={() => setStatusFilter('needs_update')}>
          <span className="kpi-label">PDF 갱신 필요</span>
          <strong className="kpi-value text-warning">{counts.needsUpdate}건</strong>
        </button>
        <button type="button" className={`kpi-card ${statusFilter === 'normal' ? 'is-active' : ''}`} onClick={() => setStatusFilter('normal')}>
          <span className="kpi-label">변동 없음 (안심)</span>
          <strong className="kpi-value text-success">{counts.normal}건</strong>
        </button>
      </section>

      {bulkOpen && (
        <form className="card-panel bulk-box" onSubmit={handleBulkSubmit}>
          <div className="bulk-box-head">
            <h3>고유번호 일괄 등록 (금융권 다건 관리용)</h3>
            <p>한 줄에 하나씩 `부동산 고유번호, 메모` 형식으로 붙여넣으세요. (최대 500건)</p>
          </div>
          <textarea
            rows={4}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'1101-2024-004128, 강남 담보 #1\n1102-2024-019204, 반포 전세집'}
          />
          <div className="bulk-box-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBulkOpen(false)}>취소</button>
            <button type="submit" className="btn btn-primary btn-sm">일괄 등록하기</button>
          </div>
        </form>
      )}

      {watchlist.length === 0 ? (
        <div className="empty-card">
          <h3>아직 변동 알림을 켠 부동산이 없어요</h3>
          <p>
            등기 검색에서 내 전세집이나 관리 중인 담보 물건을 추가하면 변동 발생 시 알림을 보내드립니다.
            ({POINTS_CONFIG.freeWatchlistCount}건 무료 · 추가 건당 월 {POINTS_CONFIG.monitorCost}{POINTS_CONFIG.unit})
          </p>
          <div className="empty-actions">
            <button type="button" className="btn btn-primary" onClick={onGoSearch}>
              등기 검색에서 물건 추가
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleLoadSamplePortfolio}>
              샘플 물건 8건 일괄 체험하기
            </button>
          </div>
        </div>
      ) : (
        <section className="card-panel">
          <div className="table-toolbar">
            <input
              type="search"
              className="table-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="관리 목록 내 주소, 건물명, 고유번호, 메모 검색"
            />
            <span className="result-count">표시 중 <strong>{filtered.length}</strong> / {watchlist.length}건</span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>부동산 / 고유번호</th>
                  <th>관리 메모</th>
                  <th>최신 등본</th>
                  <th>변동 상태</th>
                  <th>알림 채널</th>
                  <th className="align-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const prop = propMap.get(item.targetId);
                  const latestDoc = latestDocMap.get(item.targetId);
                  return (
                    <tr key={item.targetId}>
                      <td>
                        <div className="cell-strong">
                          {prop ? `${prop.buildingName}${prop.unitName ? ` ${prop.unitName}` : ''}` : item.targetId}
                        </div>
                        <small className="cell-sub">
                          {prop ? `${prop.address} · ${prop.registryUniqueNo}` : '고유번호 직접 등록'}
                        </small>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="inline-memo"
                          value={item.memo}
                          placeholder="메모 (예: 내 전세집)"
                          onChange={(e) => onUpdateWatchMeta(item.targetId, { memo: e.target.value }, false)}
                          onBlur={(e) => onUpdateWatchMeta(item.targetId, { memo: e.target.value }, true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </td>
                      <td>
                        {latestDoc ? (
                          <div>
                            <div>{formatKstDateTime(latestDoc.issuedAt)}</div>
                            {item.needsUpdate && <span className="badge badge-warning">PDF 갱신 필요</span>}
                          </div>
                        ) : (
                          <span className="cell-sub">공유 PDF 없음</span>
                        )}
                      </td>
                      <td>
                        {item.status === 'received' && <span className="badge badge-info">등기신청 접수</span>}
                        {item.status === 'completed' && <span className="badge badge-warning">등기 완료</span>}
                        {item.status === 'failed' && <span className="badge badge-danger">조회 실패</span>}
                        {item.status === 'normal' && (item.lastSuccessAt
                          ? <span className="badge badge-success">변동 없음</span>
                          : <span className="badge badge-neutral">확인 대기</span>)}
                        <div className="cell-sub-sm">확인: {formatKstDateTime(item.lastSuccessAt)}</div>
                      </td>
                      <td>
                        <select
                          className="inline-select"
                          value={item.notifyChannel}
                          aria-label="알림 채널 선택"
                          onChange={(e) =>
                            onUpdateWatchMeta(item.targetId, {
                              notifyChannel: e.target.value as 'in_app' | 'kakao' | 'sms',
                            })
                          }
                        >
                          {(['in_app', 'kakao', 'sms'] as const).map((ch) => (
                            <option key={ch} value={ch}>
                              {CHANNEL_LABELS[ch]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="align-right">
                        <div className="row-actions">
                          {prop && latestDoc && (
                            <button type="button" className="btn btn-soft btn-xs" onClick={() => onOpenPdf(prop, latestDoc)}>
                              PDF
                            </button>
                          )}
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => onRemoveWatch(item.targetId)}>
                            해제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
