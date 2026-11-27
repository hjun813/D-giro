'use client';

import {
  formatKstDateTime,
  type AlertItem,
  type PointLedgerItem,
} from '@/lib/demo-catalog';
import { formatPoints, POINT_REASON_LABELS, POINTS_CONFIG } from '@/lib/points-config';

interface ActivityTabProps {
  alerts: AlertItem[];
  pointsBalance: number;
  pointLedger: PointLedgerItem[];
  dailyViewsUsed: number;
  watchlistCount: number;
  onMarkAllAlertsRead: () => void;
  onGoShare: () => void;
  onGoWatchlist: () => void;
}

export default function ActivityTab({
  alerts,
  pointsBalance,
  pointLedger,
  dailyViewsUsed,
  watchlistCount,
  onMarkAllAlertsRead,
  onGoShare,
  onGoWatchlist,
}: ActivityTabProps) {
  const unreadCount = alerts.filter((a) => !a.read).length;
  const freeViewsRemaining = Math.max(0, POINTS_CONFIG.dailyFreeViews - dailyViewsUsed);
  const paidWatchCount = Math.max(0, watchlistCount - POINTS_CONFIG.freeWatchlistCount);

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <h1>알림 & 포인트</h1>
          <p>관심 부동산의 등기변동 알림과 등기 공유·열람 포인트 내역을 확인하세요.</p>
        </div>
      </section>

      <div className="activity-grid">
        <section className="card-panel">
          <div className="panel-head">
            <div>
              <h2>등기변동 알림</h2>
              <p className="cell-sub">읽지 않은 알림 {unreadCount}건</p>
            </div>
            {unreadCount > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onMarkAllAlertsRead}>
                모두 읽음
              </button>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="empty-inline">
              <p>아직 도착한 등기변동 알림이 없어요.</p>
              <button type="button" className="btn btn-soft btn-sm" onClick={onGoWatchlist}>
                내 관리 물건에서 변동 확인하기
              </button>
            </div>
          ) : (
            <ul className="timeline-list">
              {alerts.map((alert) => (
                <li key={alert.id} className={`timeline-item ${alert.read ? '' : 'is-unread'}`}>
                  <div className="timeline-top">
                    <span className={`badge ${alert.kind === 'completed' ? 'badge-warning' : 'badge-info'}`}>
                      {alert.kind === 'completed' ? '등기 완료' : '신청 접수'}
                    </span>
                    <small className="cell-sub">{formatKstDateTime(alert.createdAt)}</small>
                  </div>
                  <strong>{alert.title}</strong>
                  <p>{alert.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-panel">
          <div className="panel-head">
            <div>
              <h2>내 포인트</h2>
              <p className="cell-sub">등기 공유로 적립하고 열람·알림에 사용하세요</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={onGoShare}>
              PDF 공유 (+{POINTS_CONFIG.uploadReward}{POINTS_CONFIG.unit})
            </button>
          </div>

          <div className="points-hero">
            <span className="points-hero-label">보유 포인트</span>
            <strong className="points-hero-value">
              {pointsBalance.toLocaleString('ko-KR')}{POINTS_CONFIG.unit}
            </strong>
          </div>

          <div className="points-policy-strip">
            <span>최신 PDF 공유 <strong>+{POINTS_CONFIG.uploadReward}{POINTS_CONFIG.unit}</strong></span>
            <span>
              PDF 조회 <strong>일 {POINTS_CONFIG.dailyFreeViews}회 무료</strong> (잔여 {freeViewsRemaining}회 · 초과 -{POINTS_CONFIG.viewCost}{POINTS_CONFIG.unit})
            </span>
            <span>
              변동 알림 <strong>{POINTS_CONFIG.freeWatchlistCount}건 무료</strong> (추가 월 -{POINTS_CONFIG.monitorCost}{POINTS_CONFIG.unit}{paidWatchCount > 0 ? ` · 유료 ${paidWatchCount}건` : ''})
            </span>
          </div>

          <ul className="ledger-list">
            {pointLedger.map((entry) => (
              <li key={entry.id} className="ledger-item">
                <div>
                  <strong>{POINT_REASON_LABELS[entry.reason] || entry.reason}</strong>
                  <small className="cell-sub">{entry.note} · {formatKstDateTime(entry.createdAt)}</small>
                </div>
                <span className={`ledger-delta ${entry.delta >= 0 ? 'is-plus' : 'is-minus'}`}>
                  {formatPoints(entry.delta)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
