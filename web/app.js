import { locations, rounds, sampleFilename, samples, targetLabel, targets, users } from './fixtures.js';
import { documentsFor, eventsFor, initialState, loadState, needsUpdate, runRound, saveState, submitSample, toggleWatch } from './model.js';
import { connectKakaoMap, createDemoMap } from './map.js';
import { identifySampleFile } from './uploads.js';

const mapPage = document.querySelector('#map-page');
const subPage = document.querySelector('#sub-page');
const panel = document.querySelector('#results-panel');
const dialog = document.querySelector('#action-dialog');
const searchInput = document.querySelector('#search-query');
const storage = window.localStorage;
const money = new Intl.NumberFormat('ko-KR');
function formatKoreanAmount(value) {
  if (value === null || value === undefined) return '표시 항목 없음';
  const eok = Math.floor(value / 100000000);
  const man = Math.floor((value % 100000000) / 10000);
  const parts = [];
  if (eok) parts.push(`${money.format(eok)}억`);
  if (man) parts.push(`${money.format(man)}만`);
  return parts.length ? `${parts.join(' ')}원` : `${money.format(value)}원`;
}

function formatArea(areaText) {
  if (!areaText || areaUnit === 'sqm') return areaText || '';
  return areaText.replace(/([\d,]+(?:\.\d+)?)\s*㎡/, (_, raw) => {
    const sqm = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(sqm)) return `${raw}㎡`;
    return `${(sqm / 3.305785).toFixed(1)}평`;
  });
}
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const formatTime = (value) => value ? timeFormat.format(new Date(value)) : '확인 이력 없음';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

let state = loadState(storage);
const accountExamples = initialState();
let account = null;
let accountWatches = [];
let accountLoading = true;
let accountPending = false;
let accountRevision = 0;
function pageFromPath(pathname = window.location.pathname) {
  if (pathname === '/login') return 'login';
  if (pathname === '/register') return 'register';
  if (pathname === '/guide') return 'guide';
  return 'map';
}

let page = pageFromPath();
let authRedirect = null;
let panelOpen = false;
let listFilter = 'all';
let alertFilter = 'all';
let areaUnit = 'sqm';
let satelliteOn = false;
let cadastralOn = false;
let recentTargetIds = [];
let openDocId = null;
let selection = null;
let targetId = null;
let results = locations;
let searchTerm = '';
let searchStatus = 'ready';
let searchSequence = 0;
let sheet = 'open';
let toastTimer;
let dialogTrigger;
let map = createDemoMap(document.querySelector('#map-demo'), selectLocation);
let mapStatus = 'connecting';

const statusLabels = {
  published: ['공유 완료', 'success'], duplicate: ['이미 공유된 자료', 'info'], mismatch: ['등기 대상 불일치', 'warning'],
  review: ['검수 보류', 'warning'], unreadable: ['등기 대상 식별 불가', 'danger'],
  'no-change': ['새 변동 미감지', 'neutral'], failure: ['최근 조회 실패', 'danger'],
  received: ['등기신청 접수', 'info'], completed: ['등기 완료', 'info'],
};

const mapStatuses = {
  connecting: ['카카오맵 연결 확인 중', '검증용 지도로 먼저 위치를 탐색할 수 있어요.'],
  unconfigured: ['검증용 지도', '카카오맵 키를 설정하면 실제 지도와 주소 검색을 사용할 수 있어요.'],
  live: ['카카오맵 연결됨', '실제 지도에서 도로명·지번과 건물명을 검색할 수 있어요.'],
  failed: ['카카오맵 연결 실패', `카카오 개발자 설정에서 JavaScript 키와 SDK 도메인(${window.location.origin})을 확인해 주세요.`],
};

const uploadErrors = {
  empty: '파일을 선택해 주세요.',
  'invalid-type': 'PDF 또는 PNG 파일을 선택해 주세요.',
  'too-large': '5 MB 이하의 파일을 선택해 주세요.',
  unknown: '예시 파일을 확인할 수 없어요. 아래 목록에서 받은 검증용 파일을 선택해 주세요.',
};

const reviewMessages = {
  duplicate: '이미 공유된 자료예요. 업로드 이력에 제출 결과를 남겼어요.',
  mismatch: '등기 대상 불일치. 이 호수의 예시 파일을 선택해 주세요.',
  review: '검수 보류. 이 자료는 업로드 이력에서 확인할 수 있어요.',
  unreadable: '등기 대상 식별 불가. 대상 식별번호가 표시된 예시 파일을 선택해 주세요.',
};

function badge(label, tone = 'neutral') {
  return `<span class="badge badge-${tone}">${escape(label)}</span>`;
}

function status(code) {
  return badge(...(statusLabels[code] || ['확인 이력 없음', 'neutral']));
}

function button(label, action, { id = '', kind = 'secondary', disabled = false } = {}) {
  return `<button type="button" class="button ${kind}" data-action="${action}" data-id="${escape(id)}"${disabled ? ' disabled' : ''}>${escape(label)}</button>`;
}

function registryState() {
  return state;
}

function activeUserId() {
  return account?.id || state.userId;
}

function activeWatches() {
  return account ? accountWatches : [];
}

function requireLogin(message, redirect = null) {
  authRedirect = redirect ? { ...redirect, message } : { message };
  changePage('login');
  notify(message);
}

async function accountRequest(path, method = 'GET', data) {
  const response = await fetch(`/api/${path}`, {
    method,
    ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.message);
    error.status = response.status;
    throw error;
  }
  return result;
}

function updateAccount(result) {
  account = result.user;
  accountWatches = result.watchlist;
  accountRevision += 1;
}

async function refreshAccount() {
  if (accountPending) return;
  const revision = accountRevision;
  try {
    const result = await accountRequest('session');
    if (accountPending || revision !== accountRevision) return;
    const changed = result.user?.id !== account?.id || result.watchlist.join(',') !== accountWatches.join(',');
    updateAccount(result);
    if (changed && !accountLoading) {
      render();
      refreshPins();
    }
  } catch {
    // Preserve the current view when the local server is temporarily unreachable.
  } finally {
    if (accountLoading) {
      accountLoading = false;
      render();
      refreshPins();
    }
  }
}

function pinMeta(locationId) {
  const data = registryState();
  const matching = targets.filter((target) => target.locationId === locationId);
  if (!matching.length) return { label: '', hasDoc: false, tone: 'empty', count: 0 };
  const sharedCount = matching.filter((target) => documentsFor(data, target.id).length > 0).length;
  const hasNeedsUpdate = matching.some((target) => needsUpdate(data, target.id));
  const hasEvent = matching.some((target) => eventsFor(data, target.id).length > 0);
  const hasDoc = sharedCount > 0;
  const tone = hasNeedsUpdate || hasEvent ? 'alert' : hasDoc ? 'shared' : 'empty';
  const tag = hasNeedsUpdate ? '갱신 필요' : hasEvent ? '변동 감지' : '';
  return {
    label: tag || (hasDoc ? `공유 등기 ${sharedCount}건` : `대상 ${matching.length}건, 공유 자료 없음`),
    hasDoc,
    tone,
    tag,
    count: matching.length,
  };
}

function recordRecent(id) {
  if (!id || !targets.some((item) => item.id === id)) return;
  recentTargetIds = [id, ...recentTargetIds.filter((item) => item !== id)].slice(0, 4);
}

const clockIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

function renderRecentBar() {
  const bar = document.querySelector('#recent-bar');
  if (!bar) return;
  const items = recentTargetIds.map((id) => targets.find((item) => item.id === id)).filter(Boolean);
  bar.hidden = panelOpen || items.length === 0;
  if (bar.hidden) return;
  bar.innerHTML = `<div class="quick-head"><span class="quick-title">${clockIcon}최근 본 부동산</span><button type="button" class="quick-link" data-action="clear-recent">지우기</button></div>
    <div class="popular-chips">${items.map((target) =>
      `<button type="button" class="popular-chip recent-chip" data-action="open-target" data-id="${escape(target.id)}">${escape(targetLabel(target))}</button>`).join('')}</div>`;
}

function renderMapBreadcrumb() {
  const crumb = document.querySelector('#map-breadcrumb');
  if (!crumb) return;
  if (selection) {
    const parts = selection.area.split(' ').filter(Boolean);
    const count = targets.filter((item) => item.locationId === selection.id).length;
    crumb.innerHTML = `<span>${parts.map(escape).join(' › ')}</span><strong>${escape(selection.name)}</strong>${count ? `<span class="crumb-meta">대상 ${count}건</span>` : ''}`;
  } else {
    crumb.innerHTML = `<span>서울 전역</span><span class="crumb-meta">검증 위치 ${results.length}곳</span>`;
  }
}

function refreshPins() {
  const items = selection && !results.some((result) => result.id === selection.id) ? [...results, selection] : results;
  map.setPins(items, selection?.id, pinMeta);
}

function locationSummary(locationId) {
  const matching = targets.filter((target) => target.locationId === locationId);
  const sharedCount = matching.filter((target) => documentsFor(registryState(), target.id).length > 0).length;
  const types = [...new Set(matching.map((target) => target.type))];
  return { total: matching.length, sharedCount, types };
}

function renderPopularBar() {
  const tray = document.querySelector('#quick-tray');
  const bar = document.querySelector('#popular-bar');
  if (tray) tray.hidden = panelOpen;
  if (!bar) return;
  bar.hidden = panelOpen;
  if (panelOpen) return;
  const featured = locations.slice(0, 5);
  bar.innerHTML = `<div class="quick-head"><span class="quick-title">인기 주소</span><button type="button" class="quick-link" data-action="open-list">전체 ${locations.length}곳 ›</button></div>
    <div class="popular-chips">${featured.map((location) =>
      `<button type="button" class="popular-chip" data-action="quick-location" data-id="${escape(location.id)}"><span class="icon icon-pin" aria-hidden="true"></span>${escape(location.name)}</button>`).join('')}</div>`;
}

const listFilters = [
  ['all', '전체'], ['집합건물', '집합건물'], ['건물', '건물'], ['토지', '토지'], ['shared', '공유 있음'],
];

function renderSearchResults() {
  const heading = searchTerm ? `"${escape(searchTerm)}" 검색 결과` : '검증용 부동산 위치';
  const filtered = results.filter((location) => {
    if (listFilter === 'all') return true;
    const summary = locationSummary(location.id);
    if (listFilter === 'shared') return summary.sharedCount > 0;
    return summary.types.includes(listFilter);
  });
  const message = searchStatus === 'pending' ? '위치를 검색하고 있어요.' :
    searchStatus === 'error' ? '검색 결과를 불러오지 못했어요. 다시 검색해 주세요.' :
    listFilter !== 'all' && results.length ? '선택한 필터에 맞는 위치가 없어요.' : '검색 결과가 없어요. 주소나 건물명을 확인해 주세요.';
  return `<div class="panel-heading">
      <div class="panel-heading-copy"><h2>${heading}</h2>${badge(`${filtered.length}곳`, 'info')}</div>
      <button type="button" class="icon-button panel-close" data-action="panel-close" aria-label="목록 닫기">×</button>
    </div>
    <div class="filter-bar" role="group" aria-label="부동산 유형 필터">${listFilters.map(([id, label]) =>
      `<button type="button" class="filter-chip${listFilter === id ? ' is-active' : ''}" data-action="list-filter" data-id="${id}" aria-pressed="${listFilter === id}">${label}</button>`).join('')}</div>
    ${searchStatus === 'pending' || searchStatus === 'error' || !filtered.length ? `<p class="notice" role="status">${message}</p>` : ''}
    <div class="location-list">${filtered.map((location) => {
      const summary = locationSummary(location.id);
      const hasDoc = summary.sharedCount > 0;
      return `<button type="button" class="location-row" data-action="location" data-id="${escape(location.id)}">
        <span class="location-symbol${hasDoc ? ' has-doc' : ''}"><span class="icon icon-pin" aria-hidden="true"></span></span>
        <span class="location-copy">
          <span class="location-name-row"><strong>${escape(location.name)}</strong>${summary.types.length ? `<span class="location-type">${escape(summary.types.join('·'))}</span>` : ''}</span>
          <span class="location-area">${escape(location.area)}</span>
          <span class="location-meta">
            ${summary.total ? `<span class="meta-dot ${hasDoc ? 'is-live' : ''}"></span><span>${hasDoc ? `공유 등기 ${summary.sharedCount}/${summary.total}건` : `대상 ${summary.total}건 · 자료 미등록`}</span>` : '<span>검증 데이터 없음</span>'}
          </span>
        </span>
        <span class="location-tail"><span class="icon icon-chevron" aria-hidden="true"></span></span>
      </button>`;
    }).join('')}</div>`;
}

function renderTargetDetail(target) {
  const data = registryState();
  const documents = documentsFor(data, target.id);
  const latest = documents[0];
  const check = data.checks[target.id];
  const events = eventsFor(data, target.id);
  const event = events.at(-1);
  const watched = activeWatches().includes(target.id);
  const share = button(latest ? '새 자료 등록' : '등기 자료 등록', 'share', { kind: latest ? 'secondary' : 'primary' });
  return `<div class="detail-cards">
    <section class="info-card">
      <div class="section-title">
        <h3>공유 등기 자료</h3>
        ${needsUpdate(data, target.id) ? badge('문서 갱신 필요', 'warning') : latest ? badge(`버전 ${documents.length}건`, 'info') : badge('미등록', 'neutral')}
      </div>
      ${latest ? `<div class="doc-preview">
          ${target.areaText ? `<div class="doc-preview-row"><span>면적·구조</span><span class="area-inline"><strong>${escape(formatArea(target.areaText))}</strong><button type="button" class="unit-toggle" data-action="toggle-unit" aria-label="면적 단위 전환">${areaUnit === 'sqm' ? '평' : '㎡'}</button></span></div>` : ''}
          <div class="doc-preview-row"><span>소유권</span><strong>${escape(latest.owner)}</strong></div>
          <div class="doc-preview-row"><span>근저당권</span><strong class="${latest.amount === null ? 'is-clean' : 'is-debt'}">${latest.amount === null ? '표시 항목 없음' : formatKoreanAmount(latest.amount)}</strong></div>
        </div>
        <dl class="detail-list"><div><dt>발급 시각</dt><dd>${formatTime(latest.issuedAt)}</dd></div><div><dt>서비스 등록</dt><dd>${formatTime(latest.registeredAt)}</dd></div></dl>
        <div class="button-row">${button('등기 상세 보기', 'document', { id: latest.sampleId, kind: 'primary' })}${share}</div>` :
        `<p class="muted">아직 공유된 검증용 등기 자료가 없어요. 예시 파일을 올려 바로 확인해 보세요.</p><div class="button-row">${share}</div>`}
    </section>
    <section class="info-card">
      <div class="section-title"><h3>변동 모니터링</h3>${status(check?.outcome)}</div>
      <dl class="detail-list"><div><dt>마지막 확인 성공</dt><dd>${formatTime(check?.lastSuccessAt)}</dd></div>
        ${event ? `<div><dt>확인된 신청 상태</dt><dd>${statusLabels[event.kind][0]}</dd></div>` : ''}</dl>
      <div class="button-row">${button(watched ? '관심 해제' : '관심 등록', 'watch', { id: target.id, kind: watched ? 'secondary' : 'primary', disabled: accountLoading || accountPending })}
        ${button('이력 보기', 'history', { id: target.id, kind: 'quiet' })}</div>
    </section>
  </div>`;
}

function renderLocation() {
  const options = targets.filter((target) => target.locationId === selection.id);
  const target = options.find((item) => item.id === targetId);
  const watches = activeWatches();
  return `<div class="detail-header">
      <div class="detail-topline">
        <button type="button" class="text-button" data-action="close-detail">← 목록으로</button>
        <div class="detail-topline-right">${badge('검증용 가상 자료', 'info')}<button type="button" class="icon-button panel-close" data-action="panel-close" aria-label="상세 닫기">×</button></div>
      </div>
      <h2 id="location-heading" tabindex="-1">${escape(selection.name)}</h2>
      <div class="address-row">
        <p class="muted">${escape(selection.addresses?.[0] ? `${selection.area} · ${selection.addresses[0]}` : selection.area)}</p>
        <button type="button" class="copy-chip" data-action="copy-address">주소 복사</button>
      </div>
    </div>
    ${options.length ? `<section class="target-section"><div class="section-title"><h3>등기 대상 선택</h3>${badge(`${options.length}개 대상`)}</div>
      <div class="target-list" aria-label="검증용 등기 대상">${options.map((item) => {
        const hasDoc = documentsFor(registryState(), item.id).length > 0;
        const isWatched = watches.includes(item.id);
        return `<button type="button" class="target-choice${item.id === targetId ? ' selected' : ''}" data-action="target" data-id="${item.id}" aria-pressed="${item.id === targetId}">
          <span class="meta-dot ${hasDoc ? 'is-live' : ''}" aria-hidden="true"></span>
          <span>${escape(targetLabel(item))}</span>
          <span class="target-type-tag">${escape(item.type)}${isWatched ? ' · 관심' : ''}</span>
        </button>`;
      }).join('')}</div>
      ${target ? `<p class="target-id">검증 식별번호 <code>${escape(target.id)}</code></p>` : ''}
    </section>${target ? renderTargetDetail(target) : ''}` : '<p class="notice">이 위치의 검증용 데이터가 없어요.</p>'}`;
}

function renderPanel() {
  mapPage.dataset.drawer = panelOpen ? 'open' : 'closed';
  const drawerToggle = document.querySelector('#drawer-toggle');
  if (drawerToggle) {
    drawerToggle.setAttribute('aria-expanded', String(panelOpen));
    drawerToggle.setAttribute('aria-label', panelOpen ? '좌측 패널 접기' : '좌측 패널 열기');
    drawerToggle.title = panelOpen ? '패널 접기' : '패널 열기';
  }
  renderPopularBar();
  renderRecentBar();
  renderMapBreadcrumb();
  const clearBtn = document.querySelector('#search-clear');
  if (clearBtn) clearBtn.hidden = !searchInput.value.trim();
  panel.hidden = !panelOpen;
  if (!panelOpen) return;
  const scrollTop = panel.querySelector('.panel-content')?.scrollTop || 0;
  panel.dataset.sheet = sheet;
  const toggle = sheet === 'closed' ? '펼치기' : sheet === 'expanded' ? '접기' : '펼치기';
  panel.innerHTML = `<div class="sheet-toolbar"><button type="button" class="text-button" data-action="sheet-toggle">${toggle}</button>
    ${sheet !== 'closed' ? '<button type="button" class="text-button" data-action="sheet-close">닫기</button>' : ''}</div>
    <div class="panel-content">${selection ? renderLocation() : renderSearchResults()}</div>
    <div class="sidebar-foot">화면의 등기 자료와 변동 내역은 검증용 가상 자료입니다.</div>`;
  panel.querySelector('.panel-content').scrollTop = scrollTop;
}

function renderWatchPage() {
  if (accountLoading) return '<div class="page-heading"><h1 tabindex="-1">관심 부동산</h1><p role="status">관심 목록을 확인하고 있어요.</p></div>';
  const watched = activeWatches().map((id) => targets.find((target) => target.id === id)).filter(Boolean);
  const data = registryState();
  const withDoc = watched.filter((target) => documentsFor(data, target.id).length > 0).length;
  const needRefresh = watched.filter((target) => needsUpdate(data, target.id)).length;
  return `<div class="page-heading"><h1 tabindex="-1">관심 부동산</h1><p>${escape(account.email)} 계정에 저장된 관심 목록</p></div>
    <div class="stat-grid">
      <div class="stat-card"><span>전체 관심</span><strong>${watched.length}곳</strong></div>
      <div class="stat-card"><span>공유 자료 보유</span><strong>${withDoc}건</strong></div>
      <div class="stat-card${needRefresh ? ' is-warning' : ''}"><span>문서 갱신 필요</span><strong>${needRefresh}건</strong></div>
    </div>
    ${watched.length ? `<div class="record-list">${watched.map((target) => {
      const location = locations.find((item) => item.id === target.locationId);
      const latest = documentsFor(data, target.id)[0];
      return `<div class="record-row">
        <button type="button" class="record-title" data-action="open-target" data-id="${target.id}">
          <span class="record-head"><strong>${escape(targetLabel(target))}</strong>${badge(target.type, 'neutral')}${needsUpdate(data, target.id) ? badge('갱신 필요', 'warning') : ''}</span>
          <span>${location ? `${escape(location.name)} · ${escape(location.area)}` : ''}</span>
          <span class="record-sub">${latest ? `근저당권 ${latest.amount === null ? '없음' : formatKoreanAmount(latest.amount)}` : '공유 자료 미등록'} · 마지막 확인 ${formatTime(data.checks[target.id]?.lastSuccessAt)}</span>
        </button>
        <div class="record-actions">${status(data.checks[target.id]?.outcome)}${latest ? button('등기 보기', 'document', { id: latest.sampleId, kind: 'secondary' }) : ''}${button('관심 해제', 'watch', { id: target.id, kind: 'quiet', disabled: accountPending })}</div>
      </div>`;
    }).join('')}</div>` : `<section class="empty-state"><h2>관심 등록한 부동산이 없어요</h2><p>지도에서 가상 등기 대상을 선택하고 관심 등록해 보세요.</p>${button('지도에서 찾기', 'page', { id: 'map', kind: 'primary' })}</section>`}`;
}

function renderAlertsPage() {
  if (accountLoading) return '<div class="page-heading"><h1 tabindex="-1">알림</h1></div><section class="empty-state"><h2>받은 알림이 없어요</h2><p>계정을 확인하고 있어요.</p></section>';
  const allAlerts = state.notifications.filter((notification) => notification.userId === activeUserId());
  const unreadCount = allAlerts.filter((item) => !item.read).length;
  const alerts = alertFilter === 'unread' ? allAlerts.filter((item) => !item.read) : allAlerts;
  return `<div class="page-heading page-heading-row">
      <div><h1 tabindex="-1">알림</h1><p>관심 부동산의 등기변동 알림 · 안 읽은 알림 ${unreadCount}건</p></div>
      ${unreadCount ? button('모두 읽음 처리', 'read-all-alerts', { kind: 'secondary' }) : ''}
    </div>
    ${allAlerts.length ? `<div class="filter-bar filter-bar-sub" role="group" aria-label="알림 필터">
      <button type="button" class="filter-chip${alertFilter === 'all' ? ' is-active' : ''}" data-action="alert-filter" data-id="all" aria-pressed="${alertFilter === 'all'}">전체 (${allAlerts.length})</button>
      <button type="button" class="filter-chip${alertFilter === 'unread' ? ' is-active' : ''}" data-action="alert-filter" data-id="unread" aria-pressed="${alertFilter === 'unread'}">안 읽음 (${unreadCount})</button>
    </div>` : ''}
    ${alerts.length ? `<div class="record-list">${alerts.map((alert) => {
      const target = targets.find((item) => item.id === alert.targetId);
      if (!target) return '';
      const location = locations.find((item) => item.id === target.locationId);
      return `<button type="button" class="record-row alert-row${alert.read ? '' : ' unread'}" data-action="open-alert" data-id="${alert.id}">
        <span class="record-title">
          <span class="record-head">${alert.read ? '' : '<span class="meta-dot is-live" aria-hidden="true"></span>'}<strong>${statusLabels[alert.kind][0]}</strong></span>
          <span>${escape(targetLabel(target))}${location ? ` (${escape(location.name)})` : ''} · ${formatTime(alert.at)}</span>
        </span>
        ${badge(alert.read ? '읽음' : '읽지 않음', alert.read ? 'neutral' : 'info')}</button>`;
    }).join('')}</div>` : `<section class="empty-state"><h2>${allAlerts.length ? '안 읽은 알림이 없어요' : '아직 받은 알림이 없어요'}</h2><p>${allAlerts.length ? '모든 등기변동 알림을 확인했습니다.' : '관심 부동산을 등록하고 내 정보에서 변동 확인을 실행해 보세요.'}</p>${allAlerts.length ? button('전체 알림 보기', 'alert-filter', { id: 'all' }) : button('변동 확인으로 이동', 'page', { id: 'profile' })}</section>`}`;
}

function renderProfilePage() {
  const heading = '<div class="page-heading"><h1 tabindex="-1">내 정보</h1></div>';
  if (accountLoading) return `${heading}<p role="status">로그인 상태를 확인하고 있어요.</p>`;

  const submissions = state.submissions.filter((submission) => submission.userId === activeUserId());
  const unreadAlerts = state.notifications.filter((item) => item.userId === activeUserId() && !item.read).length;
  const next = rounds[state.round];
  const canRun = Boolean(next && activeWatches().length);
  const progressPercent = Math.round((state.round / rounds.length) * 100);
  const initial = (account.email[0] || 'U').toUpperCase();

  return `${heading}
    <section class="profile-hero">
      <div class="profile-identity">
        <span class="profile-avatar" aria-hidden="true">${escape(initial)}</span>
        <div class="profile-copy">
          <strong>${escape(account.email)}</strong>
          <span>회원 계정 · 관심 부동산 서버 저장 활성화</span>
        </div>
      </div>
      <div class="button-row">${button('관심 목록', 'page', { id: 'watch', kind: 'secondary' })}${button('로그아웃', 'logout', { kind: 'quiet', disabled: accountPending })}</div>
    </section>
    <div class="stat-grid">
      <div class="stat-card"><span>관심 부동산</span><strong>${activeWatches().length}곳</strong></div>
      <div class="stat-card"><span>업로드 이력</span><strong>${submissions.length}건</strong></div>
      <div class="stat-card"><span>안 읽은 알림</span><strong>${unreadAlerts}건</strong></div>
    </div>
    <div class="profile-grid">
      <section class="page-section">
        <div class="section-title"><h2>지도 연결</h2>${badge(mapStatuses[mapStatus][0], mapStatus === 'live' ? 'success' : mapStatus === 'failed' ? 'warning' : 'neutral')}</div>
        <p class="muted">${escape(mapStatuses[mapStatus][1])}</p>
      </section>
      <section class="page-section">
        <div class="section-title"><h2>모의 변동 확인</h2>${badge(`${state.round} / ${rounds.length} 회차`, 'info')}</div>
        <div class="round-progress" aria-hidden="true"><div class="round-progress-bar" style="width:${progressPercent}%"></div></div>
        <p class="muted">${next ? `다음 회차 · ${escape(next.label)}` : '준비된 조회 회차를 모두 실행했어요.'}</p>
        ${!canRun && next ? '<p class="muted">실행하려면 지도에서 하나 이상의 대상을 관심 등록하세요.</p>' : ''}
        ${state.lastRound ? `<p class="notice" role="status">${escape(state.lastRound.label)} · 대상 ${state.lastRound.count}곳 조회 · 새 알림 ${state.lastRound.newNotifications}건</p>` : ''}
        <div class="button-row">${button('변동 확인 실행', 'run-round', { kind: 'primary', disabled: !canRun })}${button('검증 초기화', 'reset-open', { kind: 'quiet' })}</div>
      </section>
    </div>
    <section class="page-section"><h2>업로드 이력</h2>
      ${submissions.length ? `<div class="record-list">${submissions.map((item) => {
        const sample = samples.find((value) => value.id === item.sampleId);
        const target = targets.find((value) => value.id === item.targetId);
        if (!sample || !target) return '';
        return `<div class="record-row"><span class="record-title"><strong>${escape(sample.name)}</strong>
          <span>${escape(targetLabel(target))} · ${formatTime(item.at)}</span></span>
          <div class="record-actions">${status(item.status)}${item.status === 'published' || item.status === 'duplicate' ? button('자료 보기', 'document', { id: item.sampleId, kind: 'quiet' }) : ''}</div></div>`;
      }).join('')}</div>` : '<p class="muted">아직 제출한 가상 자료가 없어요.</p>'}
    </section>`;
}

const userIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5"/></svg>`;

function renderGuidePage() {
  return `<section class="guide-hero">
      <div class="guide-hero-copy">
        <span class="auth-pill">등기로 MVP · 데모 안내</span>
        <h1 tabindex="-1">지도에서 등기를 찾고,<br>변동까지 한눈에 확인하는 서비스</h1>
        <p>등기로는 부동산 위치와 실제 등기 대상(동·호수)을 명확히 구분해 연결하고, 회원이 확보한 등기 자료를 허용 범위 내에서 공유하며, 관심 부동산의 등기변동을 알려 주는 웹 서비스입니다.</p>
        <div class="button-row">
          ${button('지도에서 바로 둘러보기', 'page', { id: 'map', kind: 'primary' })}
          ${account ? button('내 정보 · 변동 확인', 'page', { id: 'profile', kind: 'secondary' }) : button('로그인 / 회원가입', 'page', { id: 'login', kind: 'secondary' })}
        </div>
      </div>
    </section>

    <section class="guide-section">
      <div class="guide-section-head"><h2>왜 만들었나요?</h2><p>기존 부동산 등기 확인 과정에서 반복되는 3가지 불편을 해결하기 위해 설계했습니다.</p></div>
      <div class="guide-grid-3">
        <article class="guide-card">
          <span class="guide-num">01</span>
          <h3>위치와 등기 대상의 혼동</h3>
          <p>같은 주소·건물 안에서도 토지, 건물, 집합건물 각 동·호수는 서로 다른 등기 대상입니다. 지도 위치와 개별 등기 대상을 분리해 잘못된 호수 연결을 막습니다.</p>
        </article>
        <article class="guide-card">
          <span class="guide-num">02</span>
          <h3>자료 기준 시점의 불투명성</h3>
          <p>공유된 등기 정보는 발급 시각과 서비스 등록 시각, 외부 변동 확인 시각을 분리해 표시합니다. 등기 완료가 감지되면 <strong>문서 갱신 필요</strong>를 안내합니다.</p>
        </article>
        <article class="guide-card">
          <span class="guide-num">03</span>
          <h3>등기변동 사후 인지 위험</h3>
          <p>계약 이후 근저당 설정이나 소유권 이전이 접수되어도 매번 열람하지 않으면 알기 어렵습니다. 관심 등록한 대상의 신청 접수·등기 완료를 구분해 알립니다.</p>
        </article>
      </div>
    </section>

    <section class="guide-section">
      <div class="guide-section-head"><h2>주요 기능 구성</h2><p>데모에서 직접 확인할 수 있는 핵심 기능 4가지입니다.</p></div>
      <div class="guide-grid-2">
        <article class="guide-card">
          <div class="section-title"><h3>지도 탐색 · 접이식 좌측 패널</h3>${badge('지도 UX', 'info')}</div>
          <p>첫 화면은 지도를 넓게 보여 주며 플로팅 검색창과 <strong>인기 주소 칩</strong>으로 빠르게 이동할 수 있습니다. 네이버 지도처럼 좌측 손잡이로 패널을 접고 펼 수 있고, 유형 필터(집합건물·건물·토지·공유 있음)와 단축키(<code>/</code> 검색, <code>Esc</code> 닫기)를 지원합니다.</p>
        </article>
        <article class="guide-card">
          <div class="section-title"><h3>등기 요약 보기 · 타임라인 이력</h3>${badge('정보 구조', 'info')}</div>
          <p>표제부(면적·구조), 갑구(소유권·원인), 을구(근저당권 채권최고액 한글 표기)를 카드로 요약합니다. <strong>이력 보기</strong>에서는 발급 시각순 문서 버전과 신청 접수·완료 변동 이력을 타임라인으로 비교할 수 있습니다.</p>
        </article>
        <article class="guide-card">
          <div class="section-title"><h3>등기 자료 등록 · 자동 검증</h3>${badge('자료 공유', 'success')}</div>
          <p>PDF·PNG 파일을 드래그 앤 드롭으로 올리면 브라우저에서 SHA-256 해시로 예시 문서를 식별합니다. 대상 불일치, 식별 불가, 검수 보류, 중복 제출, 이전 버전 제출을 각각 구분해 처리합니다.</p>
        </article>
        <article class="guide-card">
          <div class="section-title"><h3>회원 계정 · 모의 변동 알림</h3>${badge('모니터링', 'warning')}</div>
          <p>로그인한 계정의 관심 부동산은 로컬 SQLite DB에 영속 저장됩니다. 내 정보에서 6단계 모의 변동 확인(미감지→접수→완료→재수신→실패→지연 응답)을 실행해 알림 생성과 마지막 확인 시각 보존을 검증할 수 있습니다.</p>
        </article>
      </div>
    </section>

    <section class="guide-section">
      <div class="guide-section-head"><h2>데모 시연 추천 순서 (5분 흐름)</h2><p>발표나 테스트 시 아래 순서대로 눌러 보면서 설명하면 전체 기능을 자연스럽게 보여 줄 수 있습니다.</p></div>
      <ol class="guide-steps">
        <li class="guide-step">
          <span class="guide-step-badge">STEP 1</span>
          <div class="guide-step-body">
            <h3>지도 탐색과 좌측 패널 전환</h3>
            <p>비로그인 상태에서 인기 주소 칩(<strong>서울시청</strong>, <strong>서울역</strong>, <strong>명동성당</strong>)을 누르거나 검색창에 주소·건물명을 입력합니다. 좌측 손잡이로 패널을 접어 지도를 넓게 보거나 다시 펼쳐 보세요.</p>
            <div class="button-row">${button('서울시청 201호 열기', 'open-target', { id: 'sample-unit-101', kind: 'secondary' })}${button('서울역 오피스텔 열기', 'open-target', { id: 'sample-officetel-301', kind: 'quiet' })}</div>
          </div>
        </li>
        <li class="guide-step">
          <span class="guide-step-badge">STEP 2</span>
          <div class="guide-step-body">
            <h3>로그인 게이트와 회원가입</h3>
            <p>비로그인 상태에서는 상단에 <strong>지도 탐색 · 이용 가이드 · 로그인</strong>만 보입니다. 상세 패널에서 <strong>관심 등록</strong>이나 <strong>등기 자료 등록</strong>을 누르면 로그인 페이지로 안내되며, 가입·로그인 후 원래 보던 등기 대상으로 자동 복귀합니다.</p>
            <div class="button-row">${account ? badge(`현재 ${account.email} 로그인됨`, 'success') : button('회원가입 페이지 열기', 'page', { id: 'register', kind: 'secondary' })}</div>
          </div>
        </li>
        <li class="guide-step">
          <span class="guide-step-badge">STEP 3</span>
          <div class="guide-step-body">
            <h3>등기 요약 모달과 이력 타임라인</h3>
            <p><strong>가상 101동 201호</strong>에서 <strong>등기 상세 보기</strong>를 눌러 표제부·갑구·을구 카드(근저당권 <code>1억 2,500만원</code>)를 확인하고, <strong>이력 보기</strong>로 문서 버전과 변동 타임라인을 보여 줍니다.</p>
          </div>
        </li>
        <li class="guide-step">
          <span class="guide-step-badge">STEP 4</span>
          <div class="guide-step-body">
            <h3>예시 파일 업로드로 정상·예외 검수 시연</h3>
            <p>자료가 비어 있는 <strong>가상 101동 202호</strong>에서 <strong>등기 자료 등록</strong>을 열고, 201호 PDF(대상 불일치), 202호 검수 보류 PDF(검수 보류), 202호 기본 PNG(정상 공유)를 차례로 올려 검증 동작을 확인합니다.</p>
            <div class="button-row">${button('서울시청 202호 열기', 'open-target', { id: 'sample-unit-102', kind: 'secondary' })}</div>
          </div>
        </li>
        <li class="guide-step">
          <span class="guide-step-badge">STEP 5</span>
          <div class="guide-step-body">
            <h3>관심 등록 → 6단계 모의 변동 확인 → 갱신 해소</h3>
            <p>201호를 <strong>관심 등록</strong>한 뒤 <strong>내 정보</strong>에서 <strong>변동 확인 실행</strong>을 차례로 누릅니다. 신청 접수·등기 완료 알림과 조회 실패 시 마지막 성공 시각 보존을 확인하고, <strong>201호 완료 반영 자료 PDF</strong>를 등록해 <strong>문서 갱신 필요</strong> 배지가 해소되는 것까지 시연합니다.</p>
            ${account ? `<div class="button-row">${button('내 정보로 이동', 'page', { id: 'profile', kind: 'secondary' })}${button('알림 확인', 'page', { id: 'alerts', kind: 'quiet' })}</div>` : ''}
          </div>
        </li>
      </ol>
    </section>

    <section class="guide-section">
      <div class="guide-section-head"><h2>현재 MVP 구현 범위</h2><p>실제로 동작하는 연동 범위와 데모용 모의 범위를 투명하게 구분합니다.</p></div>
      <div class="guide-grid-2">
        <article class="guide-card">
          <div class="section-title"><h3>실제 동작 영역</h3>${badge('Real', 'success')}</div>
          <ul class="guide-list">
            <li>카카오맵 JavaScript SDK 지도 표시 및 주소·키워드 검색</li>
            <li>SQLite 기반 회원가입·로그인·세션 쿠키·계정별 관심 목록 영속 저장</li>
            <li>브라우저 SHA-256 해시 기반 예시 PDF/PNG 파일 검증</li>
          </ul>
        </article>
        <article class="guide-card">
          <div class="section-title"><h3>모의 검증 영역</h3>${badge('Mock / 준비 중', 'neutral')}</div>
          <ul class="guide-list">
            <li>서울 전역 50곳에 연결된 가상 등기 대상 ${targets.length}건 및 샘플 문서 ${samples.length}종</li>
            <li>6단계 수동 회차 기반 모의 등기변동 확인 및 앱 내 알림</li>
            <li>카카오·Google 소셜 OAuth 로그인 및 외부 등기 API 공급처 연동</li>
          </ul>
        </article>
      </div>
    </section>`;
}

const kakaoIcon = `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#191919" d="M9 1.5C4.58 1.5 1 4.28 1 7.72c0 2.2 1.46 4.14 3.66 5.24l-.93 3.43c-.08.3.26.54.52.36l4.08-2.72c.22.02.44.04.67.04 4.42 0 8-2.78 8-6.35S13.42 1.5 9 1.5Z"/></svg>`;
const googleIcon = `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.97 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.33Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/></svg>`;

function renderAuthPage(mode) {
  const registration = mode === 'register';
  const title = registration ? '회원가입' : '로그인';
  const verb = registration ? '시작하기' : '로그인';
  const subtitle = registration
    ? '간편하게 계정을 만들고 관심 부동산 목록을 저장해 보세요.'
    : '계정에 로그인해 저장한 관심 부동산 목록을 불러오세요.';
  const brandPanel = `<aside class="auth-brand" aria-label="등기로 안내">
    <div class="auth-brand-top">
      <button type="button" class="auth-logo-button" data-action="page" data-id="map" aria-label="등기로 메인 지도로 이동"><img src="/logo.png" width="112" height="49" alt="등기로"></button>
      <span class="auth-pill">지도 기반 등기 탐색</span>
    </div>
    <div class="auth-brand-copy">
      <h2>지도에서 찾고,<br>등기변동은 바로 확인하세요</h2>
      <p>관심 부동산을 등록하면 다른 브라우저에서도 내 목록을 이어서 확인할 수 있어요.</p>
    </div>
    <ul class="auth-highlights">
      <li><span class="auth-dot" aria-hidden="true"></span>도로명·지번·건물명으로 등기 대상 탐색</li>
      <li><span class="auth-dot" aria-hidden="true"></span>동·호수별 공유 등기 자료와 기준 시각 확인</li>
      <li><span class="auth-dot" aria-hidden="true"></span>관심 부동산의 신청 접수·등기 완료 알림</li>
    </ul>
  </aside>`;

  if (accountLoading) {
    return `<div class="auth-shell">${brandPanel}<section class="auth-panel"><div class="auth-card-head"><h1 tabindex="-1">${title}</h1><p class="muted" role="status">로그인 상태를 확인하고 있어요.</p></div></section></div>`;
  }
  if (account) {
    return `<div class="auth-shell">${brandPanel}<section class="auth-panel"><div class="auth-card-head"><h1 tabindex="-1">이미 로그인되어 있어요</h1><p class="muted"><strong>${escape(account.email)}</strong> 계정으로 이용 중입니다.</p></div>
      <div class="button-row">${button('내 정보로 이동', 'page', { id: 'profile', kind: 'primary' })}${button('지도 탐색', 'page', { id: 'map' })}</div></section></div>`;
  }
  return `<div class="auth-shell">
    ${brandPanel}
    <section class="auth-panel">
      <div class="auth-tabs" role="tablist" aria-label="계정 화면 전환">
        <button type="button" role="tab" aria-selected="${!registration}" class="${!registration ? 'is-active' : ''}" data-action="page" data-id="login">로그인</button>
        <button type="button" role="tab" aria-selected="${registration}" class="${registration ? 'is-active' : ''}" data-action="page" data-id="register">회원가입</button>
      </div>
      <div class="auth-card-head">
        <h1 tabindex="-1">${title}</h1>
        <p class="muted">${subtitle}</p>
      </div>
      ${authRedirect?.message ? `<p class="upload-feedback" data-tone="info" role="status">${escape(authRedirect.message)}</p>` : ''}
      <div class="social-login">
        <button type="button" class="social-button social-kakao" data-action="social-auth" data-id="kakao">${kakaoIcon}<span>카카오로 ${verb}</span></button>
        <button type="button" class="social-button social-google" data-action="social-auth" data-id="google">${googleIcon}<span>Google로 ${verb}</span></button>
      </div>
      <p id="social-feedback" class="upload-feedback" data-tone="info" role="status" hidden></p>
      <div class="auth-divider"><span>또는 이메일로 계속하기</span></div>
      <form id="auth-form" class="auth-form" data-mode="${mode}">
        <div class="auth-field">
          <label for="auth-email">이메일</label>
          <input id="auth-email" type="email" name="email" maxlength="254" autocomplete="username" placeholder="name@example.com" required>
        </div>
        <div class="auth-field">
          <label for="auth-password">비밀번호</label>
          <input id="auth-password" type="password" name="password" minlength="12" maxlength="128" autocomplete="${registration ? 'new-password' : 'current-password'}" placeholder="${registration ? '12자 이상 입력' : '비밀번호 입력'}" required>
        </div>
        ${registration ? `<div class="auth-field">
          <label for="auth-password-confirm">비밀번호 확인</label>
          <input id="auth-password-confirm" type="password" name="passwordConfirm" minlength="12" maxlength="128" autocomplete="new-password" placeholder="비밀번호를 한 번 더 입력" required>
        </div>
        <p class="auth-help">비밀번호는 12~128자로 입력해 주세요.</p>` : ''}
        <p class="upload-feedback" role="status" hidden></p>
        <button type="submit" class="button primary auth-submit">${title}</button>
      </form>
      <div class="auth-switch">
        <span>${registration ? '이미 계정이 있으신가요?' : '아직 계정이 없으신가요?'}</span>
        ${button(registration ? '로그인' : '회원가입', 'page', { id: registration ? 'login' : 'register', kind: 'quiet' })}
      </div>
      <div class="auth-guest">
        <button type="button" class="auth-guest-link" data-action="page" data-id="map">비로그인으로 둘러보기 →</button>
      </div>
    </section>
  </div>`;
}

function render() {
  if (!account && !accountLoading && ['watch', 'alerts', 'profile'].includes(page)) {
    page = 'login';
    if (window.location.pathname !== '/login') window.history.replaceState({ page }, '', '/login');
  }
  const isAuthPage = page === 'login' || page === 'register';
  document.body.dataset.authPage = isAuthPage ? 'true' : 'false';
  document.querySelector('.site-header').hidden = isAuthPage;
  mapPage.hidden = page !== 'map';
  subPage.hidden = page === 'map';
  for (const tab of document.querySelectorAll('.navigation [data-auth-only]')) {
    tab.hidden = !account;
  }
  const navAuth = document.querySelector('#nav-auth');
  if (navAuth) navAuth.hidden = Boolean(account || accountLoading);
  const profileTab = document.querySelector('.navigation [data-id="profile"]');
  if (profileTab) {
    const label = account?.email ? `${account.email.split('@')[0].slice(0, 10)}님` : '내 정보';
    profileTab.innerHTML = `${userIcon}<span class="nav-account-label">${escape(label)}</span>`;
    profileTab.title = account?.email ? `${account.email} · 내 정보` : '내 정보';
  }
  for (const tab of document.querySelectorAll('.navigation [data-action="page"]')) {
    const active = tab.dataset.id === page || (tab.id === 'nav-auth' && isAuthPage);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const unread = account ? state.notifications.filter((item) => item.userId === account.id && !item.read).length : 0;
  const count = document.querySelector('#unread-count');
  count.textContent = unread;
  count.hidden = unread === 0;
  if (page === 'map') renderPanel();
  else subPage.innerHTML = {
    guide: renderGuidePage,
    watch: renderWatchPage,
    alerts: renderAlertsPage,
    profile: renderProfilePage,
    login: () => renderAuthPage('login'),
    register: () => renderAuthPage('register'),
  }[page]();
}

function notify(message) {
  const toast = document.querySelector('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

function selectLocation(location, specifiedTarget) {
  searchSequence += 1;
  if (searchStatus === 'pending') searchStatus = 'ready';
  document.querySelector('#search-feedback').hidden = true;
  panelOpen = true;
  selection = location;
  targetId = specifiedTarget || targets.find((target) => target.locationId === location.id)?.id || null;
  if (targetId) recordRecent(targetId);
  sheet = 'open';
  page = 'map';
  render();
  panel.querySelector('.panel-content').scrollTop = 0;
  refreshPins();
  map.select(location);
  document.querySelector('#location-heading')?.focus({ preventScroll: true });
}

function openTarget(id) {
  const target = targets.find((item) => item.id === id);
  const location = target && locations.find((item) => item.id === target.locationId);
  if (!location) return;
  selectLocation(location, id);
}

function showDialog(title, content) {
  if (!dialog.open) dialogTrigger = document.activeElement;
  dialog.innerHTML = `<div class="dialog-content"><div class="dialog-heading"><h2 id="dialog-title" tabindex="-1">${escape(title)}</h2><button type="button" class="icon-button" data-action="dialog-close" aria-label="닫기">×</button></div>${content}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('#dialog-title').focus({ preventScroll: true });
}

async function submitAuth(form) {
  const submit = form.querySelector('button[type="submit"]');
  if (accountPending) return;
  const feedback = form.querySelector('.upload-feedback');
  const mode = form.dataset.mode;
  const { email, password, passwordConfirm } = Object.fromEntries(new FormData(form));
  if (mode === 'register' && password !== passwordConfirm) {
    feedback.textContent = '비밀번호가 서로 일치하지 않아요.';
    feedback.hidden = false;
    form.elements.passwordConfirm?.focus();
    return;
  }
  accountPending = true;
  submit.disabled = true;
  feedback.hidden = true;
  try {
    updateAccount(await accountRequest(`auth/${mode}`, 'POST', { email, password }));
    accountPending = false;
    const redirect = authRedirect;
    authRedirect = null;
    if (redirect?.targetId) {
      if (window.location.pathname !== '/') window.history.pushState({ page: 'map' }, '', '/');
      openTarget(redirect.targetId);
      if (redirect.action === 'share') openShare();
    } else if (redirect?.page) {
      changePage(redirect.page);
    } else {
      changePage('map');
    }
    refreshPins();
    notify(mode === 'register' ? '회원가입을 완료했어요.' : '로그인했어요.');
  } catch (error) {
    feedback.textContent = error.status ? error.message : '서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
    feedback.hidden = false;
  } finally {
    accountPending = false;
    submit.disabled = false;
  }
}

async function logout(control) {
  if (accountPending) return;
  accountPending = true;
  control.disabled = true;
  try {
    updateAccount(await accountRequest('auth/logout', 'POST'));
    accountPending = false;
    changePage('map');
    notify('로그아웃했어요.');
  } catch {
    notify('로그아웃하지 못했어요. 다시 시도해 주세요.');
  } finally {
    accountPending = false;
    control.disabled = false;
  }
}

async function changeWatch(id, control) {
  if (accountLoading || accountPending) return;
  if (!account) {
    requireLogin('관심 부동산을 등록하려면 로그인해 주세요.', { targetId: id, action: 'watch' });
    return;
  }
  const watching = !activeWatches().includes(id);
  accountPending = true;
  control.disabled = true;
  try {
    updateAccount(await accountRequest('watchlist', 'PUT', { accountId: account.id, targetId: id, watched: watching }));
  } catch (error) {
    accountPending = false;
    if (error.status === 401) {
      updateAccount({ user: null, watchlist: [] });
      requireLogin('로그인 상태가 만료됐어요. 다시 로그인해 주세요.', { targetId: id, action: 'watch' });
      return;
    }
    if (error.status === 409) await refreshAccount();
    notify(error.status ? error.message : '관심 목록을 저장하지 못했어요. 다시 시도해 주세요.');
    return;
  } finally {
    accountPending = false;
    control.disabled = false;
  }
  render();
  if (page === 'map') panel.querySelector('[data-action="watch"]')?.focus({ preventScroll: true });
  else subPage.querySelector('h1')?.focus({ preventScroll: true });
  notify(watching ? '관심 부동산으로 등록했어요.' : '관심 등록을 해제했어요.');
}

function openDocument(id) {
  const sample = samples.find((item) => item.id === id);
  const target = targets.find((item) => item.id === sample?.targetId);
  if (!target) return;
  const active = documentsFor(registryState(), target.id).find((item) => item.sampleId === id);
  if (!active) return;
  openDocId = id;
  const location = locations.find((item) => item.id === target.locationId);
  showDialog('등기사항증명서 요약', `<div class="doc-banner">
      <div class="doc-banner-top">
        ${badge(target.type, 'info')}${badge('검증용 가상 자료', 'neutral')}
      </div>
      <h3>${escape(targetLabel(target))}</h3>
      ${location ? `<p class="muted">${escape(location.name)} · ${escape(location.area)}</p>` : ''}
      <dl class="detail-list doc-timestamps">
        <div><dt>발급 시각</dt><dd>${formatTime(active.issuedAt)}</dd></div>
        <div><dt>서비스 등록</dt><dd>${formatTime(active.registeredAt)}</dd></div>
      </dl>
    </div>
    <div class="doc-sections">
      <section class="doc-card">
        <div class="section-title"><h3>표제부</h3><button type="button" class="unit-toggle" data-action="toggle-unit">${areaUnit === 'sqm' ? '평으로 보기' : '㎡로 보기'}</button></div>
        <p>${escape(target.type)} · ${escape(targetLabel(target))}</p>
        ${target.areaText || target.structure ? `<p class="doc-sub">${[formatArea(target.areaText), target.structure].filter(Boolean).map(escape).join(' · ')}</p>` : ''}
        <p class="doc-sub">검증 식별번호 <code>${escape(target.id)}</code></p>
      </section>
      <section class="doc-card">
        <div class="section-title"><h3>갑구 · 소유권</h3>${badge('소유권 확인', 'info')}</div>
        <p class="doc-highlight">${escape(active.owner)}</p>
        ${active.ownershipCause ? `<p class="doc-sub">등기원인 · ${escape(active.ownershipCause)}</p>` : ''}
      </section>
      <section class="doc-card">
        <div class="section-title"><h3>을구 · 소유권 외 권리</h3>${badge(active.amount === null ? '근저당 없음' : active.rank || '근저당권 설정', active.amount === null ? 'success' : 'warning')}</div>
        ${active.amount === null
          ? '<p>이 샘플에는 표시할 근저당권 항목이 없어요.</p>'
          : `<p class="doc-amount">${formatKoreanAmount(active.amount)}</p>
             <p class="doc-sub">채권최고액 ${money.format(active.amount)}원${active.creditor ? ` · 근저당권자 ${escape(active.creditor)}` : ''}</p>`}
      </section>
    </div>
    <div class="button-row doc-actions"><a class="button sample-link primary" href="/samples/${sampleFilename(sample)}" download>예시 원본 ${sample.format === 'PDF' ? 'PDF' : 'PNG'} 받기</a>${button('버전·변동 이력', 'history', { id: target.id, kind: 'secondary' })}</div>`);
}

function openHistory(id) {
  const target = targets.find((item) => item.id === id);
  if (!target) return;
  const location = locations.find((item) => item.id === target.locationId);
  const data = registryState();
  const documents = documentsFor(data, id);
  const events = [...eventsFor(data, id)].reverse();
  showDialog('등기 이력 타임라인', `<div class="doc-banner">
      <div class="doc-banner-top">${badge(target.type, 'info')}${badge('검증용 가상 자료', 'neutral')}</div>
      <h3>${escape(targetLabel(target))}</h3>
      ${location ? `<p class="muted">${escape(location.name)} · ${escape(location.area)}</p>` : ''}
    </div>
    <section class="timeline-section">
      <div class="section-title"><h3>문서 버전 이력</h3>${badge(`${documents.length}건`, 'neutral')}</div>
      ${documents.length ? `<ol class="timeline">${documents.map((item, index) => `<li class="timeline-item${index === 0 ? ' is-latest' : ''}">
        <span class="timeline-node" aria-hidden="true"></span>
        <div class="timeline-card">
          <div class="history-entry"><strong>${escape(item.name)}</strong>${index === 0 ? badge('최신', 'info') : ''}</div>
          <p class="timeline-meta">${escape(item.owner)} · 근저당 ${item.amount === null ? '없음' : formatKoreanAmount(item.amount)}</p>
          <p class="timeline-time">발급 ${formatTime(item.issuedAt)} · 등록 ${formatTime(item.registeredAt)}</p>
          ${button('자료 보기', 'document', { id: item.sampleId, kind: 'quiet' })}
        </div>
      </li>`).join('')}</ol>` : '<p class="muted">공유된 문서 버전이 없어요.</p>'}
    </section>
    <section class="timeline-section">
      <div class="section-title"><h3>등기변동 이력</h3>${badge(`${events.length}건`, 'neutral')}</div>
      ${events.length ? `<ol class="timeline">${events.map((item, index) => `<li class="timeline-item${index === 0 ? ' is-latest' : ''}">
        <span class="timeline-node" aria-hidden="true"></span>
        <div class="timeline-card"><div class="history-entry">${status(item.kind)}<time datetime="${item.at}">${formatTime(item.at)}</time></div></div>
      </li>`).join('')}</ol>` : '<p class="muted">확인된 변동 이력이 없어요.</p>'}
    </section>`);
}

function openShare() {
  if (!account) {
    requireLogin('등기 자료를 공유하려면 로그인해 주세요.', { targetId, action: 'share' });
    return;
  }
  const target = targets.find((item) => item.id === targetId);
  if (!target) return;
  const location = locations.find((item) => item.id === target.locationId);
  const suggested = samples.filter((sample) => sample.targetId === target.id);
  const testIds = new Set(['unit-base', 'unreadable', 'unmasked', 'commercial-review', 'neighbor', 'officetel-301-base']);
  const others = samples.filter((sample) => sample.targetId !== target.id && testIds.has(sample.id));
  showDialog('등기 자료 등록', `<div class="share-target-card">
      <div class="section-title"><strong>${escape(targetLabel(target))}</strong>${badge(target.type, 'info')}</div>
      <p class="muted">${location ? `${escape(location.name)} · ${escape(location.area)}` : ''} · 식별번호 <code>${escape(target.id)}</code></p>
    </div>
    <form id="sample-form">
      <label id="sample-dropzone" class="dropzone" for="sample-file">
        <input id="sample-file" name="sample" type="file" accept=".pdf,.png,application/pdf,image/png" aria-describedby="sample-file-hint" required>
        <span class="dropzone-badge">PDF · PNG</span>
        <strong class="dropzone-title">파일을 끌어다 놓거나 클릭해 선택하세요</strong>
        <span class="dropzone-meta" id="sample-file-hint">최대 5 MB · 브라우저에서 즉시 검증해 대상 일치 여부를 확인해요</span>
      </label>
      <p class="upload-feedback" role="status" hidden></p>
      <button type="submit" class="button primary auth-submit">자료 검증 및 등록</button>
    </form>
    ${suggested.length ? `<div class="sample-section"><h3>이 대상의 검증용 예시 파일</h3>
      <ul class="sample-download-list">${suggested.map((sample) => `<li><a href="/samples/${sampleFilename(sample)}" download><span>${escape(sample.name)}</span>${badge(sample.format === 'PDF' ? 'PDF' : 'PNG', 'neutral')}</a></li>`).join('')}</ul>
    </div>` : ''}
    <details class="sample-files"><summary>다른 대상 · 예외 테스트용 파일 (${others.length}개)</summary>
      <ul>${others.map((sample) => `<li><a href="/samples/${sampleFilename(sample)}" download>${escape(sample.name)} <span>${sample.format === 'PDF' ? 'PDF' : 'PNG'}</span></a></li>`).join('')}</ul>
    </details>`);
}

let sampleIndex;
async function getSampleIndex() {
  if (!sampleIndex) {
    const response = await fetch('/sample-index.json');
    if (!response.ok) throw new Error('예시 파일 목록을 불러오지 못했습니다.');
    sampleIndex = await response.json();
  }
  return sampleIndex;
}

async function uploadSample(form) {
  const input = form.elements.sample;
  const submit = form.querySelector('button[type="submit"]');
  const feedback = form.querySelector('.upload-feedback');
  const selectedTarget = targetId;
  const selectedUser = activeUserId();
  if (submit.disabled) return;
  const file = input.files[0];
  input.disabled = true;
  submit.disabled = true;
  submit.textContent = '파일 확인 중';
  feedback.hidden = true;
  feedback.dataset.tone = 'danger';

  try {
    const result = await identifySampleFile(file, getSampleIndex);
    if (!dialog.open || !form.isConnected) return;
    if (result.error) {
      feedback.textContent = uploadErrors[result.error];
    } else {
      const submission = submitSample(state, selectedUser, selectedTarget, result.sampleId);
      if (!submission) throw new Error('검증용 파일을 확인하지 못했습니다.');
      saveState(storage, state);
      if (submission.status === 'published') {
        dialog.close();
        render();
        refreshPins();
        panel.querySelector('[data-action="share"]')?.focus();
        notify('검증용 자료를 공유했어요.');
        return;
      }
      feedback.textContent = reviewMessages[submission.status];
      feedback.dataset.tone = statusLabels[submission.status][1];
    }
    feedback.hidden = false;
  } catch {
    if (form.isConnected) {
      feedback.textContent = '파일 확인에 실패했어요. 다시 시도해 주세요.';
      feedback.hidden = false;
    }
  } finally {
    input.disabled = false;
    submit.disabled = false;
    submit.textContent = '자료 검증 및 등록';
  }
}

function updateDropzoneLabel(file) {
  const zone = dialog.querySelector('#sample-dropzone');
  if (!zone) return;
  const title = zone.querySelector('.dropzone-title');
  const meta = zone.querySelector('.dropzone-meta');
  if (file) {
    zone.classList.add('has-file');
    title.textContent = file.name;
    meta.textContent = `${(file.size / 1024).toFixed(1)} KB · 등록 버튼을 눌러 검증하세요`;
  } else {
    zone.classList.remove('has-file');
    title.textContent = '파일을 끌어다 놓거나 클릭해 선택하세요';
    meta.textContent = '최대 5 MB · 브라우저에서 즉시 검증해 대상 일치 여부를 확인해요';
  }
}

dialog.addEventListener('change', (event) => {
  if (event.target.id === 'sample-file') {
    dialog.querySelector('.upload-feedback').hidden = true;
    updateDropzoneLabel(event.target.files[0]);
  }
});

dialog.addEventListener('dragover', (event) => {
  const zone = event.target.closest('#sample-dropzone');
  if (!zone) return;
  event.preventDefault();
  zone.classList.add('is-dragover');
});

dialog.addEventListener('dragleave', (event) => {
  const zone = event.target.closest('#sample-dropzone');
  if (!zone || zone.contains(event.relatedTarget)) return;
  zone.classList.remove('is-dragover');
});

dialog.addEventListener('drop', (event) => {
  const zone = event.target.closest('#sample-dropzone');
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove('is-dragover');
  const input = dialog.querySelector('#sample-file');
  const file = event.dataTransfer?.files?.[0];
  if (!input || !file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  dialog.querySelector('.upload-feedback').hidden = true;
  updateDropzoneLabel(file);
});

searchInput.addEventListener('input', () => {
  const clearBtn = document.querySelector('#search-clear');
  if (clearBtn) clearBtn.hidden = !searchInput.value.trim();
});

document.addEventListener('keydown', (event) => {
  if (dialog.open || page !== 'map') return;
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  } else if (event.key === 'Escape') {
    if (document.activeElement === searchInput) {
      searchInput.blur();
    } else if (panelOpen) {
      panelOpen = false;
      renderPanel();
      refreshPins();
    }
  }
});

function changePage(value, { push = true } = {}) {
  if (['watch', 'alerts', 'profile'].includes(value) && !account && !accountLoading) {
    requireLogin('로그인 후 이용할 수 있는 메뉴예요.', { page: value });
    return;
  }
  if (value === 'map') authRedirect = null;
  page = value;
  const targetPath = page === 'login' ? '/login' : page === 'register' ? '/register' : page === 'guide' ? '/guide' : '/';
  if (push && window.location.pathname !== targetPath) {
    window.history.pushState({ page }, '', targetPath);
  }
  render();
  if (page === 'map') refreshPins();
  else subPage.querySelector('h1')?.focus({ preventScroll: true });
}

window.addEventListener('popstate', () => {
  changePage(pageFromPath(), { push: false });
});

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'auth-form') {
    event.preventDefault();
    await submitAuth(event.target);
    return;
  }
  if (event.target.id === 'sample-form') {
    event.preventDefault();
    await uploadSample(event.target);
    return;
  }
  if (event.target.id !== 'search-form') return;
  event.preventDefault();
  const term = searchInput.value.trim();
  const sequence = ++searchSequence;
  searchTerm = term;
  sheet = 'open';
  searchStatus = 'pending';
  const feedback = document.querySelector('#search-feedback');
  feedback.textContent = '위치를 검색하고 있어요.';
  feedback.hidden = false;
  try {
    const found = term ? await map.search(term) : locations;
    if (sequence !== searchSequence) return;
    results = found;
    searchStatus = 'ready';
  } catch {
    if (sequence !== searchSequence) return;
    results = [];
    searchStatus = 'error';
  } finally {
    if (sequence === searchSequence || searchStatus !== 'pending') feedback.hidden = true;
  }
  panelOpen = true;
  selection = null;
  targetId = null;
  renderPanel();
  panel.querySelector('.panel-content').scrollTop = 0;
  refreshPins();
  map.showResults?.(results);
});

dialog.addEventListener('close', () => {
  openDocId = null;
  if (dialogTrigger?.isConnected) dialogTrigger.focus({ preventScroll: true });
});

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action, id } = control.dataset;
  switch (action) {
    case 'page': changePage(id); break;
    case 'quick-location': {
      const location = locations.find((item) => item.id === id);
      if (location) selectLocation(location);
      break;
    }
    case 'open-list':
      searchTerm = '';
      searchInput.value = '';
      results = locations;
      selection = null;
      targetId = null;
      panelOpen = true;
      sheet = 'open';
      renderPanel();
      refreshPins();
      break;
    case 'clear-recent':
      recentTargetIds = [];
      renderRecentBar();
      break;
    case 'clear-search':
      searchInput.value = '';
      searchTerm = '';
      results = locations;
      document.querySelector('#search-clear').hidden = true;
      searchInput.focus();
      if (panelOpen && !selection) {
        renderPanel();
        refreshPins();
      }
      break;
    case 'drawer-toggle':
      panelOpen = !panelOpen;
      sheet = 'open';
      renderPanel();
      refreshPins();
      break;
    case 'list-filter':
      listFilter = id;
      renderPanel();
      break;
    case 'alert-filter':
      alertFilter = id;
      render();
      break;
    case 'read-all-alerts': {
      let changed = false;
      for (const item of state.notifications) {
        if (item.userId === activeUserId() && !item.read) {
          item.read = true;
          changed = true;
        }
      }
      if (changed) {
        saveState(storage, state);
        render();
        notify('모든 알림을 읽음 처리했어요.');
      }
      break;
    }
    case 'panel-close':
      panelOpen = false;
      selection = null;
      targetId = null;
      renderPanel();
      refreshPins();
      break;
    case 'location': {
      const location = results.find((item) => item.id === id);
      if (location) selectLocation(location);
      break;
    }
    case 'target':
      targetId = id;
      recordRecent(id);
      renderPanel();
      panel.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
      break;
    case 'open-target': openTarget(id); break;
    case 'close-detail':
      selection = null;
      targetId = null;
      renderPanel();
      panel.querySelector('.panel-content').scrollTop = 0;
      refreshPins();
      panel.querySelector('.location-row')?.focus({ preventScroll: true });
      break;
    case 'sheet-toggle':
      sheet = sheet === 'expanded' ? 'open' : 'expanded';
      renderPanel();
      panel.querySelector('[data-action="sheet-toggle"]')?.focus({ preventScroll: true });
      break;
    case 'sheet-close':
      sheet = 'closed';
      renderPanel();
      panel.querySelector('[data-action="sheet-toggle"]')?.focus({ preventScroll: true });
      break;
    case 'zoom-in': map.zoom(1); break;
    case 'zoom-out': map.zoom(-1); break;
    case 'map-reset': map.reset(); break;
    case 'toggle-satellite':
      satelliteOn = !satelliteOn;
      map.setSatellite?.(satelliteOn);
      control.setAttribute('aria-pressed', String(satelliteOn));
      control.classList.toggle('is-active', satelliteOn);
      break;
    case 'toggle-cadastral':
      cadastralOn = !cadastralOn;
      map.setCadastral?.(cadastralOn);
      control.setAttribute('aria-pressed', String(cadastralOn));
      control.classList.toggle('is-active', cadastralOn);
      break;
    case 'copy-address': {
      if (!selection) break;
      const fullAddress = selection.addresses?.[0] ? `${selection.area} ${selection.addresses[0]}` : `${selection.area} ${selection.name}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(fullAddress).then(() => notify('주소를 복사했어요.')).catch(() => notify('주소를 복사하지 못했어요.'));
      } else {
        notify(`주소: ${fullAddress}`);
      }
      break;
    }
    case 'toggle-unit':
      areaUnit = areaUnit === 'sqm' ? 'pyeong' : 'sqm';
      if (page === 'map') renderPanel();
      if (dialog.open && openDocId) openDocument(openDocId);
      break;
    case 'dialog-close': dialog.close(); break;
    case 'document': openDocument(id); break;
    case 'history': openHistory(id); break;
    case 'share': openShare(); break;
    case 'auth': changePage(id); break;
    case 'social-auth': {
      const provider = id === 'kakao' ? '카카오' : 'Google';
      const notice = `${provider} 로그인은 OAuth 클라이언트 설정 후 사용할 수 있어요. 지금은 이메일로 계속해 주세요.`;
      const feedback = document.querySelector('#social-feedback');
      if (feedback) {
        feedback.textContent = notice;
        feedback.hidden = false;
      }
      notify(`${provider} OAuth 연동 준비 중이에요.`);
      break;
    }
    case 'logout': void logout(control); break;
    case 'watch': void changeWatch(id, control); break;
    case 'user':
      state.userId = id;
      saveState(storage, state);
      render();
      subPage.querySelector('[data-action="user"][aria-pressed="true"]')?.focus({ preventScroll: true });
      break;
    case 'run-round': {
      if (account) state.watches[account.id] = [...accountWatches];
      const result = runRound(state);
      if (!result) break;
      saveState(storage, state);
      render();
      subPage.querySelector('[data-action="run-round"]:enabled')?.focus({ preventScroll: true });
      break;
    }
    case 'open-alert': {
      const alert = state.notifications.find((item) => item.id === id && item.userId === activeUserId());
      if (!alert) break;
      alert.read = true;
      saveState(storage, state);
      openTarget(alert.targetId);
      break;
    }
    case 'reset-open':
      showDialog('검증 데이터를 초기화할까요?', `<p class="muted">이 브라우저의 가상 관심 등록, 알림과 자료 제출 이력을 초기 상태로 되돌려요.</p><div class="button-row">${button('취소', 'dialog-close', { kind: 'quiet' })}${button('초기화', 'reset-confirm', { kind: 'primary' })}</div>`);
      break;
    case 'reset-confirm':
      state = initialState();
      saveState(storage, state);
      dialog.close();
      render();
      subPage.querySelector('[data-action="reset-open"]')?.focus({ preventScroll: true });
      notify('검증 데이터를 초기화했어요.');
      break;
  }
});

render();
refreshPins();
void refreshAccount();
window.addEventListener('focus', refreshAccount);
const liveContainer = document.querySelector('#map-live');
connectKakaoMap(liveContainer, selectLocation).then((liveMap) => {
  mapStatus = liveMap ? 'live' : 'unconfigured';
  document.querySelector('#map-mode').textContent = mapStatuses[mapStatus][0];
  if (page === 'profile') render();
  if (!liveMap) return;
  map = liveMap;
  if (satelliteOn) map.setSatellite?.(true);
  if (cadastralOn) map.setCadastral?.(true);
  mapPage.dataset.mapMode = 'live';
  new ResizeObserver(([entry]) => {
    mapPage.style.setProperty('--map-panel-inset', `${entry.borderBoxSize[0].blockSize}px`);
  }).observe(panel);
  liveContainer.hidden = false;
  document.querySelector('#map-demo').hidden = true;
  document.querySelector('#map-caption').hidden = true;
  refreshPins();
  if (selection) map.select(selection);
}).catch(() => {
  mapStatus = 'failed';
  liveContainer.hidden = true;
  document.querySelector('#map-mode').textContent = mapStatuses[mapStatus][0];
  if (page === 'profile') render();
});
