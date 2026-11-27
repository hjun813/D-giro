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
import {
  calculatePdfViewCharge,
  calculateWatchlistCharge,
  getKstDateKey,
  POINTS_CONFIG,
} from '@/lib/points-config';
import { normalizePropertyUid } from '@/lib/monitor';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import ActivityTab from './ActivityTab';
import AuthModal from './AuthModal';
import PropertyDetailModal from './PropertyDetailModal';
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
  const [canManageMonitor, setCanManageMonitor] = useState(false);
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
  const [dailyViewTracker, setDailyViewTracker] = useState<{ dateKey: string; count: number }>(() => ({
    dateKey: getKstDateKey(),
    count: 0,
  }));
  const [checkRound, setCheckRound] = useState(0);

  // Property detail modal & new-tab PDF opening state
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

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
      if (parsed.dailyViewTracker && parsed.dailyViewTracker.dateKey === getKstDateKey()) {
        setDailyViewTracker({
          dateKey: parsed.dailyViewTracker.dateKey,
          count: Number(parsed.dailyViewTracker.count) || 0,
        });
      }
      if (typeof parsed.checkRound === 'number') setCheckRound(parsed.checkRound);
    } catch {
      // ignore storage failures
    }
  }, []);

  // Persist local demo state
  useEffect(() => {
    if (supabaseConfigured && user) return;
    try {
      window.localStorage.setItem(
        LOCAL_STATE_KEY,
        JSON.stringify({ watchlist, alerts, pointLedger, viewedDocIds, dailyViewTracker, checkRound }),
      );
    } catch {
      // ignore storage failures
    }
  }, [supabaseConfigured, user, watchlist, alerts, pointLedger, viewedDocIds, dailyViewTracker, checkRound]);

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
      setCanManageMonitor(Boolean(sessionData?.canManageMonitor));
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
        const [watchRes, monitorRes] = await Promise.all([
          fetch('/api/watchlist', { cache: 'no-store' }),
          fetch('/api/monitor/notifications', { cache: 'no-store' }),
        ]);
        const watchData = await watchRes.json().catch(() => null);
        const monitorData = await monitorRes.json().catch(() => null);

        const stateByTarget = new Map<string, any>();
        if (Array.isArray(monitorData?.monitorStates)) {
          for (const st of monitorData.monitorStates) {
            stateByTarget.set(st.targetId, st);
          }
        }

        if (Array.isArray(monitorData?.notifications)) {
          const allPropMap = new Map<string, RegistryProperty>();
          for (const p of DEMO_PROPERTIES) allPropMap.set(p.id, p);
          if (Array.isArray(docsData?.properties)) {
            for (const p of docsData.properties) {
              const uid = normalizePropertyUid(p.registry_unique_no || p.id.replace(/^iros:/, ''));
              const item: RegistryProperty = {
                id: p.id,
                registryUniqueNo: p.registry_unique_no || p.id.replace(/^iros:/, ''),
                address: p.address || '',
                buildingName: p.building_name || p.location_name || '등록 부동산',
                unitName: p.unit_name || '',
                propertyType: p.property_type || '집합건물',
                areaText: p.area_text || '',
                structure: p.structure || '',
              };
              allPropMap.set(p.id, item);
              if (uid) allPropMap.set(uid, item);
            }
          }

          const dbAlerts: AlertItem[] = monitorData.notifications.map((n: any) => {
            const uid = normalizePropertyUid(n.propertyId) || n.propertyId;
            const prop = allPropMap.get(n.propertyId) || allPropMap.get(uid);
            const title = prop
              ? `${prop.buildingName}${prop.unitName ? ` ${prop.unitName}` : ''} (${uid})`
              : `고유번호 ${uid}`;
            return {
              id: n.id,
              propertyId: n.propertyId,
              title,
              kind: n.kind === 'completed' ? 'completed' : 'received',
              message:
                n.kind === 'completed'
                  ? '등기 처리가 완료되었습니다. 최신 등기부등본 PDF를 확인해 주세요.'
                  : '새로운 등기신청 접수가 감지되었습니다. 권리 변동 여부를 확인해 주세요.',
              createdAt: n.createdAt,
              read: Boolean(n.read),
            };
          });
          setAlerts(dbAlerts);
        }

        if (Array.isArray(watchData?.items)) {
          setWatchlist((prev) => {
            const prevMap = new Map(prev.map((w) => [w.targetId, w]));
            return watchData.items.map((row: any) => {
              const existing = monitorRes.ok ? undefined : prevMap.get(row.targetId);
              const st = stateByTarget.get(row.targetId);
              let derivedStatus: WatchItem['status'] = existing?.status ?? 'normal';
              if (st) {
                if (st.lastStatus && st.lastStatus !== 'ok') {
                  derivedStatus = 'failed';
                } else if (st.hasCompletedEvent) {
                  derivedStatus = 'completed';
                } else if (st.hasOpenApplication) {
                  derivedStatus = 'received';
                }
              }

              return {
                targetId: row.targetId,
                memo: row.memo || existing?.memo || '',
                notifyChannel: row.notifyChannel || existing?.notifyChannel || 'in_app',
                createdAt: row.createdAt || new Date().toISOString(),
                status: derivedStatus,
                lastCheckedAt: st?.lastAttemptAt || existing?.lastCheckedAt || null,
                lastSuccessAt: st?.lastSuccessAt || existing?.lastSuccessAt || null,
                needsUpdate: st?.hasCompletedEvent ?? existing?.needsUpdate ?? false,
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
        return monitorRes.ok;
      }
      return true;
    } catch {
      return false;
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

  async function handleOpenPdfNewTab(property: RegistryProperty, doc: RegistryDocumentItem) {
    const alreadyViewed = viewedDocIds.includes(doc.id);
    const todayKey = getKstDateKey();
    const todayCountBefore = dailyViewTracker.dateKey === todayKey ? dailyViewTracker.count : 0;

    if (doc.source === 'supabase' && doc.pdfUrl?.startsWith('/api/documents/')) {
      setOpeningDocId(doc.id);
      // 비동기 응답 전 동기적으로 새 탭을 열어 팝업 차단 회피
      const popup = window.open('', '_blank');
      if (popup) {
        popup.document.title = `${property.buildingName} 등기부등본 불러오는 중...`;
        popup.document.body.innerHTML =
          '<div style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;">등기부등본 PDF를 불러오는 중입니다...</div>';
      }

      try {
        const res = await fetch(doc.pdfUrl, { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.url) {
          popup?.close();
          showToast(data?.message || 'PDF를 열람할 수 없어요.');
          return;
        }
        if (popup && !popup.closed) {
          popup.location.href = data.url;
        } else {
          window.open(data.url, '_blank', 'noopener,noreferrer');
        }
        if (!doc.uploadedByMe && !alreadyViewed) {
          const usedToday = typeof data.dailyViewsUsed === 'number' ? data.dailyViewsUsed : todayCountBefore + 1;
          const cost = typeof data.pointsCharged === 'number'
            ? data.pointsCharged
            : calculatePdfViewCharge(todayCountBefore, false).cost;

          setViewedDocIds((prev) => [...prev, doc.id]);
          setDailyViewTracker({ dateKey: todayKey, count: usedToday });
          if (cost > 0) {
            addLocalLedger(-cost, 'document_view', `${property.buildingName} PDF 조회 (일 무료 초과)`, doc.id);
            showToast(`오늘 무료 조회(${POINTS_CONFIG.dailyFreeViews}회)를 모두 사용해 -${cost}${POINTS_CONFIG.unit}가 차감되었어요.`);
          } else {
            showToast(`오늘 무료 조회 ${usedToday}/${POINTS_CONFIG.dailyFreeViews}회 사용`);
          }
        }
      } catch {
        popup?.close();
        showToast('PDF 열람 링크를 불러오지 못했어요.');
      } finally {
        setOpeningDocId(null);
      }
      return;
    }

    // Demo or local blob PDF: 새 탭으로 즉시 열람
    if (!doc.pdfUrl) {
      showToast('표시할 PDF 파일이 없어요.');
      return;
    }
    window.open(doc.pdfUrl, '_blank', 'noopener,noreferrer');
    if (!doc.uploadedByMe && !alreadyViewed) {
      const charge = calculatePdfViewCharge(todayCountBefore, false);
      setViewedDocIds((prev) => [...prev, doc.id]);
      setDailyViewTracker({ dateKey: todayKey, count: charge.usedTodayAfter });
      if (charge.cost > 0) {
        addLocalLedger(-charge.cost, 'document_view', `${property.buildingName} PDF 조회 (일 무료 초과)`, doc.id);
        showToast(`오늘 무료 조회(${POINTS_CONFIG.dailyFreeViews}회)를 모두 사용해 -${charge.cost}${POINTS_CONFIG.unit}가 차감되었어요.`);
      } else {
        showToast(`오늘 무료 조회 ${charge.usedTodayAfter}/${POINTS_CONFIG.dailyFreeViews}회 사용`);
      }
    }
  }

  async function handleToggleWatch(property: RegistryProperty) {
    const exists = watchlist.some((w) => w.targetId === property.id);
    const nextWatched = !exists;
    const charge = nextWatched ? calculateWatchlistCharge(watchlist.length, 1) : { freeCount: 0, paidCount: 0, totalCost: 0 };

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
      if (charge.totalCost > 0) {
        addLocalLedger(
          -charge.totalCost,
          'monitor_subscribe',
          `${property.buildingName} 변동 알림 추가 구독 (월 ${POINTS_CONFIG.monitorCost}${POINTS_CONFIG.unit})`,
          property.id,
        );
        showToast(`${property.buildingName} 변동 알림을 켰어요. (-${charge.totalCost}${POINTS_CONFIG.unit} / 월)`);
      } else {
        showToast(`${property.buildingName} 변동 알림을 무료로 켰어요. (단건 무료 혜택)`);
      }
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
    persist = true,
  ) {
    const current = watchlist.find((w) => w.targetId === targetId);
    setWatchlist((prev) => prev.map((w) => (w.targetId === targetId ? { ...w, ...patch } : w)));
    if (persist && supabaseConfigured && user) {
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

    const charge = calculateWatchlistCharge(watchlist.length, uniqueNew.length);

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
    if (charge.totalCost > 0) {
      addLocalLedger(
        -charge.totalCost,
        'monitor_subscribe',
        `변동 알림 ${charge.paidCount}건 추가 구독 (월 건당 ${POINTS_CONFIG.monitorCost}${POINTS_CONFIG.unit})`,
      );
      showToast(
        `${uniqueNew.length}건 일괄 등록 완료 (${charge.freeCount > 0 ? `${charge.freeCount}건 무료 · ` : ''}${charge.paidCount}건 -${charge.totalCost}${POINTS_CONFIG.unit})`,
      );
    } else {
      showToast(`${uniqueNew.length}건의 관리 물건을 무료로 등록했어요.`);
    }
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
    const rewardedCount = items.filter((i) => i.points > 0).length;
    if (totalPoints > 0) {
      addLocalLedger(
        totalPoints,
        'upload_reward',
        rewardedCount === 1
          ? `${items.find((i) => i.points > 0)!.property.buildingName} 최신 등기 PDF 공유`
          : `최신 등기 PDF ${rewardedCount}건 공유`,
      );
    }

    // 갱신 필요 상태였던 관리 물건에 새 문서가 올라오면 갱신 완료 처리
    const updatedIds = new Set(items.map((i) => i.property.id));
    setWatchlist((prev) =>
      prev.map((w) => (updatedIds.has(w.targetId) ? { ...w, needsUpdate: false, status: 'normal' } : w)),
    );

    if (totalPoints > 0) {
      showToast(`등기 PDF ${items.length}건 공유 완료! (최신 ${rewardedCount}건 +${totalPoints.toLocaleString('ko-KR')}${POINTS_CONFIG.unit} 적립)`);
    } else {
      showToast(`등기 PDF ${items.length}건 이력 등록 완료 (기존보다 이전 시점 등기는 포인트 미적립)`);
    }
  }

  async function handleRunMonitoringCheck() {
    if (watchlist.length === 0) return;
    if (supabaseConfigured && user) {
      const loaded = await hydrateFromServer();
      showToast(loaded ? '저장된 변동 확인 내역을 불러왔어요.' : '변동 확인 내역을 불러오지 못했어요.');
      return;
    }
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

  const selectedProperty = useMemo(
    () => (selectedPropertyId ? properties.find((p) => p.id === selectedPropertyId) || null : null),
    [selectedPropertyId, properties],
  );

  const selectedPropertyDocs = useMemo(() => {
    if (!selectedPropertyId) return [];
    return documents
      .filter((d) => d.propertyId === selectedPropertyId)
      .sort((a, b) => (b.issuedAt || '').localeCompare(a.issuedAt || ''));
  }, [selectedPropertyId, documents]);

  const selectedWatchItem = useMemo(
    () => (selectedPropertyId ? watchlist.find((w) => w.targetId === selectedPropertyId) || null : null),
    [selectedPropertyId, watchlist],
  );

  async function handleMarkAllAlertsRead() {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    if (supabaseConfigured && user) {
      await fetch('/api/monitor/notifications', { method: 'PATCH' }).catch(() => {});
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setCanManageMonitor(false);
    setWatchlist([]);
    setAlerts([]);
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
            onSelectProperty={(prop) => setSelectedPropertyId(prop.id)}
            onGoShare={() => setTab('share')}
          />
        )}
        {tab === 'share' && (
          <ShareTab
            isLoggedIn={Boolean(user)}
            supabaseConfigured={supabaseConfigured}
            existingDocuments={documents}
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
            canManageMonitor={canManageMonitor}
            usesSavedMonitoring={Boolean(supabaseConfigured && user)}
            onOpenPdf={handleOpenPdfNewTab}
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
            dailyViewsUsed={dailyViewTracker.dateKey === getKstDateKey() ? dailyViewTracker.count : 0}
            watchlistCount={watchlist.length}
            onMarkAllAlertsRead={handleMarkAllAlertsRead}
            onGoShare={() => setTab('share')}
            onGoWatchlist={() => setTab('watchlist')}
          />
        )}
      </main>

      <PropertyDetailModal
        open={selectedProperty !== null}
        property={selectedProperty}
        documents={selectedPropertyDocs}
        watchItem={selectedWatchItem}
        watchlistCount={watchlist.length}
        openingDocId={openingDocId}
        onOpenPdfNewTab={handleOpenPdfNewTab}
        onToggleWatch={handleToggleWatch}
        onUpdateWatchMeta={handleUpdateWatchMeta}
        onGoShare={() => setTab('share')}
        onClose={() => setSelectedPropertyId(null)}
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
