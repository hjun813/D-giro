'use client';

import { useEffect } from 'react';
import { formatKoreanMoney, formatKstDateTime, type RegistryDocumentItem, type RegistryProperty } from '@/lib/demo-catalog';

interface PdfViewerModalProps {
  open: boolean;
  property: RegistryProperty | null;
  document: RegistryDocumentItem | null;
  pdfUrl: string | null;
  loading: boolean;
  error: string | null;
  isWatched: boolean;
  onToggleWatch: () => void;
  onClose: () => void;
}

export default function PdfViewerModal({
  open,
  property,
  document,
  pdfUrl,
  loading,
  error,
  isWatched,
  onToggleWatch,
  onClose,
}: PdfViewerModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !document) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pdf-modal-title" onClick={onClose}>
      <div className="pdf-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pdf-modal-header">
          <div className="pdf-modal-title-group">
            <div className="pdf-modal-badges">
              <span className="badge badge-info">{property?.propertyType || '등기부등본'}</span>
              {property?.registryUniqueNo && (
                <span className="badge badge-neutral">고유번호 {property.registryUniqueNo}</span>
              )}
              <span className="badge badge-neutral">발급 {formatKstDateTime(document.issuedAt)}</span>
            </div>
            <h2 id="pdf-modal-title" className="pdf-modal-title">
              {property ? `${property.buildingName}${property.unitName ? ` ${property.unitName}` : ''}` : document.originalFilename}
            </h2>
            {property?.address && <p className="pdf-modal-sub">{property.address}</p>}
          </div>

          <div className="pdf-modal-actions">
            <button
              type="button"
              className={isWatched ? 'btn btn-secondary is-active' : 'btn btn-secondary'}
              onClick={onToggleWatch}
            >
              {isWatched ? '변동 알림 중' : '변동 알림 켜기'}
            </button>
            {pdfUrl && (
              <a className="btn btn-ghost" href={pdfUrl} target="_blank" rel="noreferrer">
                새 창
              </a>
            )}
            <button type="button" className="btn-icon" onClick={onClose} aria-label="닫기">
              ×
            </button>
          </div>
        </header>

        <div className="pdf-meta-strip">
          <span><strong>소유자</strong> {document.ownerMasked || '미확인'}</span>
          <span><strong>근저당</strong> {formatKoreanMoney(document.mortgageAmount)}{document.creditor ? ` (${document.creditor})` : ''}</span>
          {document.ownershipCause && <span><strong>소유권 원인</strong> {document.ownershipCause}</span>}
          {document.riskFlags.length > 0 && (
            <span className="badge badge-danger">주의: {document.riskFlags.join(', ')}</span>
          )}
        </div>

        <div className="pdf-viewer-body">
          {loading ? (
            <div className="pdf-placeholder">
              <div className="spinner" aria-hidden="true" />
              <p>등기부등본 PDF를 불러오는 중입니다...</p>
            </div>
          ) : error ? (
            <div className="pdf-placeholder">
              <p className="text-danger">{error}</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={`${pdfUrl}#toolbar=1&navpanes=0`}
              title="등기부등본 PDF 뷰어"
              className="pdf-iframe"
            />
          ) : (
            <div className="pdf-placeholder">
              <p>표시할 PDF 파일이 없습니다.</p>
            </div>
          )}
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
