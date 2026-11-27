'use client';

import { useEffect } from 'react';
import {
  formatKoreanMoney,
  formatKstDateTime,
  type RegistryDocumentItem,
  type RegistryProperty,
  type WatchItem,
} from '@/lib/demo-catalog';
import { POINTS_CONFIG } from '@/lib/points-config';

interface PropertyDetailModalProps {
  open: boolean;
  property: RegistryProperty | null;
  documents: RegistryDocumentItem[];
  watchItem: WatchItem | null;
  watchlistCount: number;
  openingDocId: string | null;
  onOpenPdfNewTab: (property: RegistryProperty, doc: RegistryDocumentItem) => void;
  onToggleWatch: (property: RegistryProperty) => void;
  onUpdateWatchMeta: (targetId: string, patch: { memo?: string; notifyChannel?: 'in_app' | 'kakao' | 'sms' }) => void;
  onGoShare: () => void;
  onClose: () => void;
}

const CHANNEL_LABELS: Record<'in_app' | 'kakao' | 'sms', string> = {
  in_app: '앱 내 알림',
  kakao: '카카오 알림톡',
  sms: '문자(SMS)',
};

export default function PropertyDetailModal({
  open,
  property,
  documents,
  watchItem,
  watchlistCount,
  openingDocId,
  onOpenPdfNewTab,
  onToggleWatch,
  onUpdateWatchMeta,
  onGoShare,
  onClose,
}: PropertyDetailModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !property) return null;

  const latestDoc = documents[0] || null;
  const isWatched = Boolean(watchItem);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
      onClick={onClose}
    >
      <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
        <header className="detail-modal-header">
          <div className="detail-modal-title-group">
            <div className="pdf-modal-badges">
              <span className="badge badge-info">{property.propertyType}</span>
              <span className="badge badge-neutral">고유번호 {property.registryUniqueNo}</span>
              {isWatched && <span className="badge badge-success">변동 알림 구독 중</span>}
            </div>
            <h2 id="detail-modal-title" className="detail-modal-title">
              {property.buildingName}
              {property.unitName ? ` ${property.unitName}` : ''}
            </h2>
            <p className="detail-modal-sub">
              {property.address}
              {(property.areaText || property.structure) && (
                <> · {[property.areaText, property.structure].filter(Boolean).join(' / ')}</>
              )}
            </p>
          </div>

          <button type="button" className="btn-icon" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <div className="detail-modal-body">
          {/* 1. 변동 알림 영역 */}
          <section className={`detail-alert-banner ${isWatched ? 'is-watched' : ''}`}>
            <div className="detail-alert-copy">
              <strong>{isWatched ? '등기변동 알림을 받고 있어요' : '등기변동 알림을 켜두세요'}</strong>
              <p>
                {isWatched
                  ? '소유권 이전·근저당 설정·가압류 등 새로운 등기신청이 접수되면 바로 알려드립니다.'
                  : watchlistCount < POINTS_CONFIG.freeWatchlistCount
                    ? `첫 ${POINTS_CONFIG.freeWatchlistCount}건은 무료로 변동 알림을 받을 수 있어요. (추가 건당 월 ${POINTS_CONFIG.monitorCost}${POINTS_CONFIG.unit})`
                    : `추가 물건 변동 알림은 건당 월 ${POINTS_CONFIG.monitorCost}${POINTS_CONFIG.unit}가 차감됩니다. (${POINTS_CONFIG.freeWatchlistCount}건 무료 적용 중)`}
              </p>
            </div>
            <div className="detail-alert-controls">
              {isWatched && watchItem && (
                <select
                  className="inline-select"
                  value={watchItem.notifyChannel}
                  aria-label="알림 채널 선택"
                  onChange={(e) =>
                    onUpdateWatchMeta(property.id, {
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
              )}
              <button
                type="button"
                className={isWatched ? 'btn btn-secondary is-active btn-sm' : 'btn btn-primary btn-sm'}
                onClick={() => onToggleWatch(property)}
              >
                {isWatched ? '알림 해제' : '변동 알림 켜기'}
              </button>
            </div>
          </section>

          {/* 2. 최신 등기 요약 */}
          {latestDoc && (
            <section className="detail-section">
              <div className="detail-section-head">
                <h3>최신 공유 등기 요약</h3>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={openingDocId === latestDoc.id}
                  onClick={() => onOpenPdfNewTab(property, latestDoc)}
                >
                  {openingDocId === latestDoc.id ? '열람 중...' : '최신 등기 조회하기 ↗'}
                </button>
              </div>

              <div className="detail-summary-grid">
                <div className="detail-summary-item">
                  <span className="meta-label">최신 발급일시</span>
                  <strong className="meta-value">{formatKstDateTime(latestDoc.issuedAt)}</strong>
                </div>
                <div className="detail-summary-item">
                  <span className="meta-label">소유자 (마스킹)</span>
                  <strong className="meta-value">{latestDoc.ownerMasked || '미확인'}</strong>
                </div>
                <div className="detail-summary-item">
                  <span className="meta-label">채권최고액</span>
                  <strong className="meta-value">
                    {formatKoreanMoney(latestDoc.mortgageAmount)}
                    {latestDoc.creditor ? ` (${latestDoc.creditor})` : ''}
                  </strong>
                </div>
                <div className="detail-summary-item">
                  <span className="meta-label">소유권 원인 / 특이사항</span>
                  <strong className="meta-value">
                    {latestDoc.ownershipCause || '확인 필요'}
                    {latestDoc.riskFlags.length > 0 && (
                      <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                        {latestDoc.riskFlags.join(', ')}
                      </span>
                    )}
                  </strong>
                </div>
              </div>
            </section>
          )}

          {/* 3. 등기부등본 공유 이력 */}
          <section className="detail-section">
            <div className="detail-section-head">
              <div>
                <h3>등기부등본 공유 이력</h3>
                <p className="cell-sub">
                  총 <strong>{documents.length}</strong>건 · 조회하기를 누르면 새 탭에서 PDF를 바로 확인할 수 있어요.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={() => {
                  onClose();
                  onGoShare();
                }}
              >
                + 새 등기 PDF 공유
              </button>
            </div>

            {documents.length === 0 ? (
              <div className="empty-inline">
                <p>아직 공유된 등기부등본 PDF가 없어요.</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    onClose();
                    onGoShare();
                  }}
                >
                  첫 등기 PDF 공유하고 +{POINTS_CONFIG.uploadReward}{POINTS_CONFIG.unit} 받기
                </button>
              </div>
            ) : (
              <ul className="history-list">
                {documents.map((doc, idx) => {
                  const isOpening = openingDocId === doc.id;
                  return (
                    <li key={doc.id} className={`history-item ${idx === 0 ? 'is-latest' : ''}`}>
                      <div className="history-item-main">
                        <div className="history-item-badges">
                          {idx === 0 && <span className="badge badge-info">최신</span>}
                          <span className={`badge ${doc.source === 'supabase' ? 'badge-success' : 'badge-neutral'}`}>
                            {doc.source === 'supabase' ? '실제 공유 PDF' : '체험 샘플'}
                          </span>
                          {doc.uploadedByMe && <span className="badge badge-neutral">내 공유</span>}
                          {doc.riskFlags.length > 0 && (
                            <span className="badge badge-danger">{doc.riskFlags.join(', ')}</span>
                          )}
                        </div>
                        <div className="history-item-title">
                          발급일시 {formatKstDateTime(doc.issuedAt)}
                        </div>
                        <div className="history-item-meta">
                          <span>소유자 {doc.ownerMasked || '미확인'}</span>
                          <span>·</span>
                          <span>
                            채권최고액 {formatKoreanMoney(doc.mortgageAmount)}
                            {doc.creditor ? ` (${doc.creditor})` : ''}
                          </span>
                          {doc.ownershipCause && (
                            <>
                              <span>·</span>
                              <span>{doc.ownershipCause}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className={idx === 0 ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                        disabled={isOpening}
                        onClick={() => onOpenPdfNewTab(property, doc)}
                      >
                        {isOpening ? '여는 중...' : '조회하기 ↗'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <footer className="pdf-modal-footer">
          <p>
            공유된 등기부등본은 발급 시각 기준 참고 자료입니다. 계약·대출 실행 등 법적 효력이 필요한 경우 인터넷등기소에서 최신 등기사항증명서를 직접 발급해 확인하세요.
          </p>
        </footer>
      </div>
    </div>
  );
}
