'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEMO_DOCUMENTS,
  DEMO_PROPERTIES,
  type AlertItem,
  type PointLedgerItem,
  type RegistryDocumentItem,
  type RegistryProperty,
  type WatchItem,
} from '@/lib/demo-catalog';
import { POINTS_CONFIG } from '@/lib/points-config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import ActivityTab from './ActivityTab';
import AuthModal from './AuthModal';
import PdfViewerModal from './PdfViewerModal';
import SearchTab from './SearchTab';
import ShareTab from './ShareTab';
import WatchlistTab from './WatchlistTab';

export type AppTab = 'search' | 'share' | 'watchlist' | 'activity';

interface UserInfo {
  id: string;
  email: string;
}

const LOCAL_STATE_KEY = 'deunggiro-v2-state';

export default function DeunggiroApp({
  initialTab = 'search',
  initialAuthModal = null,
}: {
  initialTab?: AppTab;
  initialAuthModal?: 'login' | 'register' | null;
}) {
  const [tab, setTab] = useState<AppTab>(initialTab);
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authModal, setAuthModal] = useState<'login' | 'register' | null>(initialAuthModal);

  const [properties, setProperties] = useState<RegistryProperty[]>(DEMO_PROPERTIES);
  const [documents, setDocuments] = useState<RegistryDocumentItem[]>(DEMO_DOCUMENTS);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [pointLedger, setPointLedger] = useState<PointLedgerItem[]>([
    {
      id: 'welcome-init',
      delta: POINTS_CONFIG.welcomeBonus,
      reason: 'welcome',
      note: '신규 체험 웰컴 포인트',
      createdAt: new Date().toISOString(),
    },
  ]);
  const [viewedDocIds, setViewedDocIds] = useState<string[]>([]);
  const [checkRound, setCheckRound] = useState(0);

  // PDF viewer modal state
  const [pdfModal, setPdfModal] = useState<{
    open: boolean;
    property: RegistryProperty | null;
    document: RegistryDocumentItem | null;
    url: string | null;
    loading: boolean;
    error: string | null;
  }>({ open: false, property: null, document: null, url: null, loading: false, error: null });

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // Load local demo state once
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.watchlist)) setWatchlist(parsed.watchlist);
      if (Array.isArray(parsed.alerts)) setAlerts(parsed.alerts);
      if (Array.isArray(parsed.pointLedger) && parsed.pointLedger.length > 0) setPointLedger(parsed.pointLedger);
      if (Array.isArray(parsed.viewedDocIds)) setViewedDocIds(parsed.viewedDocIds);
      if (typeof parsed.checkRound === 'number') setCheckRound(parsed.checkRound);
    } catch {
      // ignore storage failures
    }
  }, []);

  // Persist local demo state
  useEffect(() => {
    try {
      window.localStorage.setItem(
        LOCAL_STATE_KEY,
        JSON.stringify({ watchlist, alerts, pointLedger, viewedDocIds, checkRound }),
      );
    } catch {
      // ignore storage failures
    }
  }, [watchlist, alerts, pointLedger, viewedDocIds, checkRound]);

  const hydrateFromServer = useCallback(async () => {
    try {
      const [sessionRes, docsRes, pointsRes] = await Promise.all([
        fetch('/api/session', { cache: 'no-store' }),
        fetch('/api/documents', { cache: 'no-store' }),
        fetch('/api/points', { cache: 'no-store' }),
      ]);

      const sessionData = await sessionRes.json().catch(() => null);
      const docsData = await docsRes.json().catch(() => null);
      const pointsData = await pointsRes.json().catch(() => null);

      const configured = Boolean(sessionData?.configured);
      setSupabaseConfigured(configured);
      setUser(sessionData?.user || null);

      if (docsData?.configured && Array.isArray(docsData.documents)) {
        const dbProps: RegistryProperty[] = (docsData.properties || []).map((p: any) => ({
          id: p.id,
          registryUniqueNo: p.registry_unique_no || p.id.replace(/^iros:/, ''),
          address: p.address || '',
          buildingName: p.building_name || p.location_name || '등록 부동산',
          unitName: p.unit_name || '',
          propertyType: p.property_type || '집합건물',
          areaText: p.area_text || '',
          structure: p.structure || '',
        }));

        const dbDocs: RegistryDocumentItem[] = docsData.documents.map((d: any) => ({
          id: d.id,
          propertyId: d.property_id,
          issuedAt: d.issued_at || d.created_at,
          createdAt: d.created_at,
          ownerMasked: d.owner_masked || '미확인',
          ownershipCause: d.ownership_cause || '',
          mortgageAmount: d.mortgage_amount ?? null,
          creditor: d.creditor || '',
          rankLabel: d.rank_label || '',
          riskFlags: [],
          pdfUrl: d.has_pdf ? `/api/documents/${d.id}/file` : null,
          originalFilename: `${d.property_id}.pdf`,
          source: 'supabase',
          uploadedByMe: Boolean(d.uploaded_by_me),
        }));

        setProperties((prev) => {
          const map = new Map<string, RegistryProperty>();
          for (const p of DEMO_PROPERTIES) map.set(p.id, p);
          for (const p of prev) map.set(p.id, p);
          for (const p of dbProps) map.set(p.id, p);
          return Array.from(map.values());
        });

        setDocuments((prev) => {
          const map = new Map<string, RegistryDocumentItem>();
          for (const d of DEMO_DOCUMENTS) map.set(d.id, d);
          for (const d of prev) map.set(d.id, d);
          for (const d of dbDocs) map.set(d.id, d);
          return Array.from(map.values());
        });
      }

      if (configured && sessionData?.user) {
        const watchRes = await fetch('/api/watchlist', { cache: 'no-store' });
        const watchData = await watchRes.json().catch(() => null);
        if (Array.isArray(watchData?.items)) {
          setWatchlist((prev) => {
            const prevMap = new Map(prev.map((w) => [w.targetId, w]));
            return watchData.items.map((row: any) => {
              const existing = prevMap.get(row.targetId);
              return {
                targetId: row.targetId,
                memo: row.memo || existing?.memo || '',
                notifyChannel: row.notifyChannel || existing?.notifyChannel || 'in_app',
                createdAt: row.createdAt || new Date().toISOString(),
                status: existing?.status || 'normal',
                lastCheckedAt: existing?.lastCheckedAt || null,
                lastSuccessAt: existing?.lastSuccessAt || null,
                needsUpdate: existing?.needsUpdate || false,
              };
            });
          });
        }

        if (pointsData?.configured && Array.isArray(pointsData.ledger) && !pointsData.migrationPending) {
          setPointLedger([
            ...pointsData.ledger,
            {
              id: 'welcome-server',
              delta: POINTS_CONFIG.welcomeBonus,
              reason: 'welcome',
              note: '회원 가입 웰컴 포인트',
              createdAt: sessionData.user.created_at || new Date().toISOString(),
            },
          ]);
        }
      }
    } catch {
      // keep demo fallback
    }
  }, []);

  useEffect(() => {
    void hydrateFromServer();
  }, [hydrateFromServer]);

  const pointsBalance = useMemo(
    () => pointLedger.reduce((sum, item) => sum + item.delta, 0),
    [pointLedger],
  );

  const unreadAlertCount = useMemo(
    () => alerts.filter((a) => !a.read).length,
    [alerts],
  );

  const addLocalLedger = useCallback(
    (delta: number, reason: PointLedgerItem['reason'], note: string, refId?: string) => {
      if (delta === 0) return;
      setPointLedger((prev) => [
        {
          id: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          delta,
          reason,
          refId,
          note,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    [],
  );

  async function handleOpenPdf(property: RegistryProperty, doc: RegistryDocumentItem) {
    setPdfModal({ open: true, property, document: doc, url: null, loading: true, error: null });

    const alreadyViewed = viewedDocIds.includes(doc.id);

    if (doc.source === 'supabase' && doc.pdfUrl?.startsWith('/api/documents/')) {
      try {
        const res = await fetch(doc.pdfUrl, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) {
          setPdfModal((prev) => ({
            ...prev,
            loading: false,
            error: data?.message || 'PDF를 열람할 수 없어요.',
          }));
          return;
        }
        setPdfModal((prev) => ({ ...prev, loading: false, url: data.url }));
        if (!doc.uploadedByMe && !alreadyViewed) {
          setViewedDocIds((prev) => [...prev, doc.id]);
          addLocalLedger(-POINTS_CONFIG.viewCost, 'document_view', `${property.buildingName} PDF 열람`, doc.id);
        }
      } catch {
        setPdfModal((prev) => ({ ...prev, loading: false, error: 'PDF 열람 링크를 불러오지 못했어요.' }));
      }
      return;
    }

    // Demo or local blob PDF
    setPdfModal((prev) => ({ ...prev, loading: false, url: doc.pdfUrl }));
    if (!doc.uploadedByMe && !alreadyViewed) {
      setViewedDocIds((prev) => [...prev, doc.id]);
      addLocalLedger(-POINTS_CONFIG.viewCost, 'document_view', `${property.buildingName} PDF 열람`, doc.id);
    }
  }

  async function handleToggleWatch(property: RegistryProperty) {
    const exists = watchlist.some((w) => w.targetId === property.id);
    const nextWatched = !exists;

    if (supabaseConfigured && user) {
      try {
        const res = await fetch('/api/watchlist', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: property.id, watched: nextWatched }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          showToast(data?.message || '관심 물건 변경에 실패했어요.');
          return;
        }
      } catch {
        showToast('네트워크 오류가 발생했어요.');
        return;
      }
    }

    if (nextWatched) {
      setWatchlist((prev) => [
        {
          targetId: property.id,
          memo: '',
          notifyChannel: 'in_app',
          createdAt: new Date().toISOString(),
          status: 'normal',
          lastCheckedAt: null,
          lastSuccessAt: null,
          needsUpdate: false,
        },
        ...prev,
      ]);
      addLocalLedger(-POINTS_CONFIG.monitorCost, 'monitor_subscribe', `${property.buildingName} 변동 알림 구독`, property.id);
      showToast(`${property.buildingName} 변동 알림을 켰어요.`);
    } else {
      setWatchlist((prev) => prev.filter((w) => w.targetId !== property.id));
      showToast(`${property.buildingName} 변동 알림을 해제했어요.`);
    }
  }

  async function handleRemoveWatch(targetId: string) {
    if (supabaseConfigured && user) {
      await fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, watched: false }),
      }).catch(() => {});
    }
    setWatchlist((prev) => prev.filter((w) => w.targetId !== targetId));
    showToast('관리 목록에서 해제했어요.');
  }

  function handleUpdateWatchMeta(
    targetId: string,
    patch: { memo?: string; notifyChannel?: 'in_app' | 'kakao' | 'sms' },
  ) {
    setWatchlist((prev) => prev.map((w) => (w.targetId === targetId ? { ...w, ...patch } : w)));
    if (supabaseConfigured && user) {
      const current = watchlist.find((w) => w.targetId === targetId);
      void fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId,
          watched: true,
          memo: patch.memo ?? current?.memo ?? '',
          notifyChannel: patch.notifyChannel ?? current?.notifyChannel ?? 'in_app',
        }),
      }).catch(() => {});
    }
  }

  async function handleBulkAddWatch(entries: Array<{ targetId: string; memo: string }>) {
    const existingSet = new Set(watchlist.map((w) => w.targetId));
    const uniqueNew = entries.filter((e) => !existingSet.has(e.targetId));
    if (uniqueNew.length === 0) {
      showToast('이미 모두 관리 목록에 등록되어 있어요.');
      return;
    }

    if (supabaseConfigured && user) {
      await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: uniqueNew }),
      }).catch(() => {});
    }

    const now = new Date().toISOString();
    setWatchlist((prev) => [
      ...uniqueNew.map((e) => ({
        targetId: e.targetId,
        memo: e.memo,
        notifyChannel: 'in_app' as const,
        createdAt: now,
        status: 'normal' as const,
        lastCheckedAt: null,
        lastSuccessAt: null,
        needsUpdate: false,
      })),
      ...prev,
    ]);
    showToast(`${uniqueNew.length}건의 관리 물건을 일괄 등록했어요.`);
  }

  function handleDocumentsPublished(
    items: Array<{ property: RegistryProperty; document: RegistryDocumentItem; points: number }>,
  ) {
    setProperties((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      for (const item of items) map.set(item.property.id, item.property);
      return Array.from(map.values());
    });
    setDocuments((prev) => [...items.map((i) => i.document), ...prev]);

    const totalPoints = items.reduce((sum, i) => sum + i.points, 0);
    if (totalPoints > 0) {
      addLocalLedger(
        totalPoints,
        'upload_reward',
        items.length === 1
          ? `${items[0].property.buildingName} 등기 PDF 공유`
          : `등기 PDF ${items.length}건 대량 공유`,
      );
    }

    // 갱신 필요 상태였던 관리 물건에 새 문서가 올라오면 갱신 완료 처리
    const updatedIds = new Set(items.map((i) => i.property.id));
    setWatchlist((prev) =>
      prev.map((w) => (updatedIds.has(w.targetId) ? { ...w, needsUpdate: false, status: 'normal' } : w)),
    );

    showToast(`등기 PDF ${items.length}건 공유 완료! +${totalPoints.toLocaleString('ko-KR')}${POINTS_CONFIG.unit} 적립`);
  }

  function handleRunMonitoringCheck() {
    if (watchlist.length === 0) return;
    const now = new Date().toISOString();
    const nextRound = checkRound + 1;
    setCheckRound(nextRound);

    const propMap = new Map(properties.map((p) => [p.id, p]));
    const newAlerts: AlertItem[] = [];

    setWatchlist((prev) =>
      prev.map((item, idx) => {
        // 첫 번째 회차: 기준 상태 확인
        if (nextRound === 1) {
          return { ...item, status: 'normal', lastCheckedAt: now, lastSuccessAt: now };
        }
        // 두 번째 회차: 첫 번째 물건에 등기신청 접수 감지
        if (nextRound % 3 === 2 && idx === 0) {
          const prop = propMap.get(item.targetId);
          const title = prop ? `${prop.buildingName}${prop.unitName ? ` ${prop.unitName}` : ''}` : item.targetId;
          newAlerts.push({
            id: `alert-${now}-${item.targetId}-received`,
            propertyId: item.targetId,
            title,
            kind: 'received',
            message: '새로운 등기신청 접수가 감지되었습니다. (근저당권 설정 또는 권리 변동 가능성 확인 필요)',
            createdAt: now,
            read: false,
          });
          return { ...item, status: 'received', lastCheckedAt: now, lastSuccessAt: now };
        }
        // 세 번째 회차: 등기 완료 & PDF 갱신 필요
        if (nextRound % 3 === 0 && idx === 0) {
          const prop = propMap.get(item.targetId);
          const title = prop ? `${prop.buildingName}${prop.unitName ? ` ${prop.unitName}` : ''}` : item.targetId;
          newAlerts.push({
            id: `alert-${now}-${item.targetId}-completed`,
            propertyId: item.targetId,
            title,
            kind: 'completed',
            message: '등기 처리가 완료되었습니다. 최신 등기부등본 PDF를 확인해 권리관계를 갱신하세요.',
            createdAt: now,
            read: false,
          });
          return { ...item, status: 'completed', needsUpdate: true, lastCheckedAt: now, lastSuccessAt: now };
        }
        return { ...item, lastCheckedAt: now, lastSuccessAt: now };
      }),
    );

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev]);
      showToast(`변동 확인 완료 · 새로운 변동 알림 ${newAlerts.length}건이 도착했어요.`);
    } else {
      showToast(`${watchlist.length}건 변동 확인 완료 · 현재까지 새 변동이 없어요.`);
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    showToast('로그아웃했어요.');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="brand-btn" onClick={() => setTab('search')} aria-label="등기로 홈">
            <img src="/assets/images/logo.png" width={104} height={45} alt="등기로" />
          </button>

          <nav className="nav-tabs" aria-label="주요 메뉴">
            <button
              type="button"
              className={`nav-tab ${tab === 'search' ? 'is-active' : ''}`}
              onClick={() => setTab('search')}
            >
              등기 검색
            </button>
            <button
              type="button"
              className={`nav-tab ${tab === 'share' ? 'is-active' : ''}`}
              onClick={() => setTab('share')}
            >
              등기 공유 <span className="nav-pill">+{POINTS_CONFIG.uploadReward}{POINTS_CONFIG.unit}</span>
            </button>
            <button
              type="button"
              className={`nav-tab ${tab === 'watchlist' ? 'is-active' : ''}`}
              onClick={() => setTab('watchlist')}
            >
              내 관리 물건
              {watchlist.length > 0 && <span className="nav-count">{watchlist.length}</span>}
            </button>
            <button
              type="button"
              className={`nav-tab ${tab === 'activity' ? 'is-active' : ''}`}
              onClick={() => setTab('activity')}
            >
              알림 & 포인트
              {unreadAlertCount > 0 && <span className="nav-dot" aria-label={`읽지 않은 알림 ${unreadAlertCount}건`}>{unreadAlertCount}</span>}
            </button>
          </nav>

          <div className="topbar-right">
            <button
              type="button"
              className="points-chip"
              onClick={() => setTab('activity')}
              title="내 포인트 내역 보기"
            >
              {pointsBalance.toLocaleString('ko-KR')}{POINTS_CONFIG.unit}
            </button>

            {user ? (
              <div className="user-menu">
                <span className="user-email">{user.email}</span>
                <button type="button" className="btn-header-ghost" onClick={handleSignOut}>
                  로그아웃
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-header-primary"
                onClick={() => setAuthModal('login')}
              >
                로그인
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        {tab === 'search' && (
          <SearchTab
            properties={properties}
            documents={documents}
            watchlist={watchlist}
            onOpenPdf={handleOpenPdf}
            onToggleWatch={handleToggleWatch}
            onGoShare={() => setTab('share')}
          />
        )}
        {tab === 'share' && (
          <ShareTab
            isLoggedIn={Boolean(user)}
            supabaseConfigured={supabaseConfigured}
            onRequireLogin={() => setAuthModal('login')}
            onDocumentsPublished={handleDocumentsPublished}
            onToast={showToast}
          />
        )}
        {tab === 'watchlist' && (
          <WatchlistTab
            properties={properties}
            documents={documents}
            watchlist={watchlist}
            onOpenPdf={handleOpenPdf}
            onRemoveWatch={handleRemoveWatch}
            onUpdateWatchMeta={handleUpdateWatchMeta}
            onBulkAddWatch={handleBulkAddWatch}
            onRunMonitoringCheck={handleRunMonitoringCheck}
            onGoSearch={() => setTab('search')}
          />
        )}
        {tab === 'activity' && (
          <ActivityTab
            alerts={alerts}
            pointsBalance={pointsBalance}
            pointLedger={pointLedger}
            onMarkAllAlertsRead={() => setAlerts((prev) => prev.map((a) => ({ ...a, read: true })))}
            onGoShare={() => setTab('share')}
            onGoWatchlist={() => setTab('watchlist')}
          />
        )}
      </main>

      <PdfViewerModal
        open={pdfModal.open}
        property={pdfModal.property}
        document={pdfModal.document}
        pdfUrl={pdfModal.url}
        loading={pdfModal.loading}
        error={pdfModal.error}
        isWatched={Boolean(pdfModal.property && watchlist.some((w) => w.targetId === pdfModal.property?.id))}
        onToggleWatch={() => {
          if (pdfModal.property) void handleToggleWatch(pdfModal.property);
        }}
        onClose={() => setPdfModal((prev) => ({ ...prev, open: false }))}
      />

      <AuthModal
        open={authModal !== null}
        initialMode={authModal || 'login'}
        supabaseConfigured={supabaseConfigured}
        onClose={() => setAuthModal(null)}
        onSuccess={() => {
          void hydrateFromServer();
          showToast('로그인되었어요.');
        }}
      />

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
