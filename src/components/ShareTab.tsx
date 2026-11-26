'use client';

import { useRef, useState } from 'react';
import { formatKstDateTime, type RegistryDocumentItem, type RegistryProperty } from '@/lib/demo-catalog';
import { POINTS_CONFIG } from '@/lib/points-config';
import type { ParsedRegistryDocument } from '@/lib/registry-parser';

export interface UploadQueueItem {
  localId: string;
  file: File;
  status: 'parsing' | 'ready' | 'pii_blocked' | 'unreadable' | 'uploading' | 'published' | 'duplicate' | 'error';
  message: string;
  parsed?: ParsedRegistryDocument;
  pointsAwarded?: number;
}

interface ShareTabProps {
  isLoggedIn: boolean;
  supabaseConfigured: boolean;
  onRequireLogin: () => void;
  onDocumentsPublished: (items: Array<{ property: RegistryProperty; document: RegistryDocumentItem; points: number }>) => void;
  onToast: (message: string) => void;
}

const DEMO_SAMPLE_FILES = [
  { url: '/samples/gangnam-stn-base.pdf', name: '강남대로396_1201호_등기부등본.pdf' },
  { url: '/samples/officetel-301-new.pdf', name: '서울역_오피스텔_301호_최신등본.pdf' },
  { url: '/samples/unit-new.pdf', name: '세종대로_집합건물_최신등본.pdf' },
];

export default function ShareTab({
  isLoggedIn,
  supabaseConfigured,
  onRequireLogin,
  onDocumentsPublished,
  onToast,
}: ShareTabProps) {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function analyzeFiles(files: File[]) {
    const pdfFiles = files.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      onToast('PDF 파일만 업로드할 수 있어요.');
      return;
    }

    const newItems: UploadQueueItem[] = pdfFiles.map((file, idx) => ({
      localId: `${Date.now()}-${idx}-${file.name}`,
      file,
      status: 'parsing',
      message: 'PDF 텍스트 및 개인정보 검사 중...',
    }));

    setQueue((prev) => [...newItems, ...prev]);

    // 4건씩 병렬 파싱 (수십~200건 대량 업로드 대응)
    const concurrency = 4;
    let cursor = 0;

    async function worker() {
      while (cursor < newItems.length) {
        const item = newItems[cursor++];
        try {
          const form = new FormData();
          form.append('file', item.file);
          const res = await fetch('/api/documents/parse', { method: 'POST', body: form });
          const data = await res.json();

          if (!res.ok) {
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId
                  ? { ...q, status: 'unreadable', message: data?.message || '텍스트를 읽지 못했어요.' }
                  : q,
              ),
            );
            continue;
          }

          const parsed: ParsedRegistryDocument = data.parsed;
          if (parsed.exposedRrnCount > 0) {
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId
                  ? {
                      ...q,
                      status: 'pii_blocked',
                      parsed,
                      message: `주민등록번호 13자리 노출(${parsed.exposedRrnCount}건) — 미공개 발급 PDF만 공유 가능`,
                    }
                  : q,
              ),
            );
            continue;
          }

          if (!parsed.registryUniqueNo && !parsed.address) {
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId
                  ? { ...q, status: 'unreadable', parsed, message: '고유번호·주소를 찾지 못했어요.' }
                  : q,
              ),
            );
            continue;
          }

          setQueue((prev) =>
            prev.map((q) =>
              q.localId === item.localId
                ? {
                    ...q,
                    status: 'ready',
                    parsed,
                    message: '개인정보 안전 확인 완료 · 공유 가능',
                  }
                : q,
            ),
          );
        } catch {
          setQueue((prev) =>
            prev.map((q) =>
              q.localId === item.localId
                ? { ...q, status: 'error', message: '분석 중 오류가 발생했어요.' }
                : q,
            ),
          );
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, newItems.length) }, () => worker()));
  }

  async function loadDemoSampleBatch() {
    const loaded: File[] = [];
    for (const sample of DEMO_SAMPLE_FILES) {
      try {
        const res = await fetch(sample.url);
        if (!res.ok) continue;
        const blob = await res.blob();
        loaded.push(new File([blob], sample.name, { type: 'application/pdf' }));
      } catch {
        // ignore
      }
    }
    if (loaded.length > 0) {
      await analyzeFiles(loaded);
      onToast(`체험용 등기 PDF ${loaded.length}건을 불러왔어요.`);
    }
  }

  async function handlePublishAll() {
    const readyItems = queue.filter((q) => q.status === 'ready');
    if (readyItems.length === 0) return;

    if (supabaseConfigured && !isLoggedIn) {
      onRequireLogin();
      return;
    }

    setSubmitting(true);
    const publishedBatch: Array<{ property: RegistryProperty; document: RegistryDocumentItem; points: number }> = [];

    for (const item of readyItems) {
      setQueue((prev) =>
        prev.map((q) => (q.localId === item.localId ? { ...q, status: 'uploading', message: '공유 등록 중...' } : q)),
      );

      const parsed = item.parsed!;
      const fallbackUniqueNo = parsed.registryUniqueNo || `DEMO-${Math.floor(100000 + Math.random() * 900000)}`;
      const propertyId = `iros:${fallbackUniqueNo}`;

      if (supabaseConfigured && isLoggedIn) {
        try {
          const form = new FormData();
          form.append('file', item.file);
          form.append('propertyId', propertyId);
          const res = await fetch('/api/documents', { method: 'POST', body: form });
          const data = await res.json();

          if (res.ok && data.status === 'published') {
            const prop: RegistryProperty = {
              id: data.propertyId,
              registryUniqueNo: parsed.registryUniqueNo || fallbackUniqueNo,
              address: parsed.address || '주소 미확인',
              buildingName: parsed.buildingName || item.file.name.replace(/\.pdf$/i, ''),
              unitName: parsed.unitName || '',
              propertyType: parsed.propertyType,
              areaText: parsed.areaText || '',
              structure: parsed.structure || '',
            };
            const doc: RegistryDocumentItem = {
              id: data.document.id,
              propertyId: data.propertyId,
              issuedAt: data.document.issued_at || new Date().toISOString(),
              createdAt: data.document.created_at || new Date().toISOString(),
              ownerMasked: data.document.owner_masked || parsed.ownerMasked,
              ownershipCause: data.document.ownership_cause || parsed.ownershipCause,
              mortgageAmount: data.document.mortgage_amount ?? parsed.mortgageAmount,
              creditor: data.document.creditor || parsed.creditor,
              rankLabel: data.document.rank_label || parsed.rankLabel,
              riskFlags: parsed.riskFlags || [],
              pdfUrl: URL.createObjectURL(item.file),
              originalFilename: item.file.name,
              source: 'supabase',
              uploadedByMe: true,
            };
            const points = Number(data.pointsAwarded ?? POINTS_CONFIG.uploadReward);
            publishedBatch.push({ property: prop, document: doc, points });
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId
                  ? { ...q, status: 'published', pointsAwarded: points, message: `공유 완료 (+${points}${POINTS_CONFIG.unit})` }
                  : q,
              ),
            );
          } else if (data.status === 'duplicate') {
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId
                  ? { ...q, status: 'duplicate', pointsAwarded: 0, message: '이미 공유된 동일 파일 (포인트 미지급)' }
                  : q,
              ),
            );
          } else {
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId
                  ? { ...q, status: 'error', message: data.message || '등록에 실패했어요.' }
                  : q,
              ),
            );
          }
        } catch {
          setQueue((prev) =>
            prev.map((q) => (q.localId === item.localId ? { ...q, status: 'error', message: '네트워크 오류가 발생했어요.' } : q)),
          );
        }
      } else {
        // 체험 모드: 브라우저 세션에 즉시 반영 + PDF 뷰어 바로 열람 가능
        const prop: RegistryProperty = {
          id: propertyId,
          registryUniqueNo: fallbackUniqueNo,
          address: parsed.address || '주소 미확인',
          buildingName: parsed.buildingName || item.file.name.replace(/\.pdf$/i, ''),
          unitName: parsed.unitName || '',
          propertyType: parsed.propertyType,
          areaText: parsed.areaText || '',
          structure: parsed.structure || '',
        };
        const doc: RegistryDocumentItem = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          propertyId,
          issuedAt: parsed.issuedAt || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          ownerMasked: parsed.ownerMasked || '소유자 미확인',
          ownershipCause: parsed.ownershipCause || '',
          mortgageAmount: parsed.mortgageAmount,
          creditor: parsed.creditor || '',
          rankLabel: parsed.rankLabel || '',
          riskFlags: parsed.riskFlags || [],
          pdfUrl: URL.createObjectURL(item.file),
          originalFilename: item.file.name,
          source: 'demo',
          uploadedByMe: true,
        };
        const points = POINTS_CONFIG.uploadReward;
        publishedBatch.push({ property: prop, document: doc, points });
        setQueue((prev) =>
          prev.map((q) =>
            q.localId === item.localId
              ? { ...q, status: 'published', pointsAwarded: points, message: `체험 공유 완료 (+${points}${POINTS_CONFIG.unit})` }
              : q,
          ),
        );
      }
    }

    if (publishedBatch.length > 0) {
      onDocumentsPublished(publishedBatch);
    }
    setSubmitting(false);
  }

  const readyCount = queue.filter((q) => q.status === 'ready').length;
  const publishedCount = queue.filter((q) => q.status === 'published').length;
  const blockedCount = queue.filter((q) => q.status === 'pii_blocked' || q.status === 'unreadable' || q.status === 'error').length;
  const expectedPoints = readyCount * POINTS_CONFIG.uploadReward;

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <h1>등기 PDF 공유하고 포인트 받기</h1>
          <p>
            1건부터 200건까지 한 번에 드래그해서 올리세요. 고유번호와 발급일을 자동 인식하고 건당{' '}
            <strong>+{POINTS_CONFIG.uploadReward}{POINTS_CONFIG.unit}</strong>를 적립해 드립니다.
          </p>
        </div>
        <button type="button" className="btn btn-soft btn-sm" onClick={loadDemoSampleBatch}>
          체험용 샘플 PDF 3건 불러오기
        </button>
      </section>

      <div
        className={`dropzone ${dragOver ? 'is-dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files || []);
          if (files.length > 0) void analyzeFiles(files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) void analyzeFiles(files);
            e.target.value = '';
          }}
        />
        <div className="dropzone-icon" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M12 16V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M4 20h16" />
          </svg>
        </div>
        <h2>등기부등본 PDF 파일을 여기에 끌어다 놓으세요</h2>
        <p>여러 파일을 한꺼번에 선택할 수 있어요 (인터넷등기소 전자발급 PDF · 파일당 5MB 이하)</p>
        <span className="dropzone-safety">주민등록번호 13자리가 노출된 파일은 자동으로 업로드가 차단됩니다</span>
      </div>

      {queue.length > 0 && (
        <section className="card-panel queue-panel">
          <div className="queue-header">
            <div className="queue-stats">
              <span>전체 <strong>{queue.length}</strong>건</span>
              <span className="text-primary-accent">공유 가능 <strong>{readyCount}</strong>건</span>
              {publishedCount > 0 && <span className="text-success">완료 <strong>{publishedCount}</strong>건</span>}
              {blockedCount > 0 && <span className="text-danger">제외 <strong>{blockedCount}</strong>건</span>}
            </div>
            <div className="queue-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQueue([])} disabled={submitting}>
                목록 비우기
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={readyCount === 0 || submitting}
                onClick={handlePublishAll}
              >
                {submitting
                  ? '일괄 등록 중...'
                  : `${readyCount}건 일괄 공유 (+${expectedPoints.toLocaleString('ko-KR')}${POINTS_CONFIG.unit})`}
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>파일명</th>
                  <th>식별된 부동산 / 고유번호</th>
                  <th>발급일시</th>
                  <th>검증 상태</th>
                  <th className="align-right">예상 적립</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.localId}>
                    <td className="cell-strong">{item.file.name}</td>
                    <td>
                      <div>{item.parsed?.address || item.parsed?.buildingName || '-'}</div>
                      {item.parsed?.registryUniqueNo && (
                        <small className="cell-sub">{item.parsed.registryUniqueNo}</small>
                      )}
                    </td>
                    <td>{item.parsed?.issuedAt ? formatKstDateTime(item.parsed.issuedAt) : '-'}</td>
                    <td>
                      <span
                        className={`badge ${
                          item.status === 'published'
                            ? 'badge-success'
                            : item.status === 'ready'
                              ? 'badge-info'
                              : item.status === 'duplicate'
                                ? 'badge-warning'
                                : item.status === 'parsing' || item.status === 'uploading'
                                  ? 'badge-neutral'
                                  : 'badge-danger'
                        }`}
                      >
                        {item.message}
                      </span>
                    </td>
                    <td className="align-right cell-strong">
                      {item.status === 'ready'
                        ? `+${POINTS_CONFIG.uploadReward}${POINTS_CONFIG.unit}`
                        : item.status === 'published'
                          ? `+${item.pointsAwarded ?? POINTS_CONFIG.uploadReward}${POINTS_CONFIG.unit}`
                          : '0P'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
