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
let page = 'map';
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
  return account ? accountExamples : state;
}

function activeWatches() {
  return account ? accountWatches : state.watches[state.userId];
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

function documentStatus(locationId) {
  const matching = targets.filter((target) => target.locationId === locationId);
  if (!matching.length) return '';
  return registryState().documents.some((document) => matching.some((target) => target.id === document.targetId)) ? '공유 자료 있음' : '공유 자료 없음';
}

function refreshPins() {
  const items = selection && !results.some((result) => result.id === selection.id) ? [...results, selection] : results;
  map.setPins(items, selection?.id, documentStatus);
}

function renderSearchResults() {
  const heading = searchTerm ? '검색 결과' : '검증용 위치';
  const message = searchStatus === 'pending' ? '위치를 검색하고 있어요.' :
    searchStatus === 'error' ? '검색 결과를 불러오지 못했어요. 다시 검색해 주세요.' : '검색 결과가 없어요. 주소나 건물명을 확인해 주세요.';
  return `<div class="panel-heading"><h2>${heading}</h2>${badge(`${results.length}곳`)}</div>
    ${searchStatus === 'pending' || searchStatus === 'error' || !results.length ? `<p class="notice" role="status">${message}</p>` : ''}
    <div class="location-list">${results.map((location) => {
      const availability = documentStatus(location.id);
      return `<button type="button" class="location-row" data-action="location" data-id="${escape(location.id)}">
        <span class="location-symbol"><span class="icon icon-pin" aria-hidden="true"></span></span>
        <span class="location-copy"><strong>${escape(location.name)}</strong><span>${escape(location.area)}</span>
          ${location.subtitle ? `<span class="location-example">${escape(location.subtitle)}</span>` : ''}</span>
        <span class="location-tail">${availability ? badge(availability, availability.endsWith('있음') ? 'info' : 'neutral') : ''}<span class="icon icon-chevron" aria-hidden="true"></span></span>
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
  const share = account ? '' : button('등기 자료 공유', 'share', { kind: latest ? 'secondary' : 'primary' });
  return `<section class="detail-section"><div class="section-title"><h3>공유 등기 자료</h3>${needsUpdate(data, target.id) ? badge('문서 갱신 필요', 'warning') : ''}</div>
    ${latest ? `<dl class="detail-list"><div><dt>발급 시각</dt><dd>${formatTime(latest.issuedAt)}</dd></div><div><dt>서비스 등록</dt><dd>${formatTime(latest.registeredAt)}</dd></div></dl>
      <div class="button-row">${button('공유 등기 보기', 'document', { id: latest.sampleId, kind: 'primary' })}${share}</div>` :
      `<p class="muted">공유된 검증용 자료가 없어요.</p>${share}`}
  </section>
  <section class="detail-section"><div class="section-title"><h3>변동 확인</h3>${status(check?.outcome)}</div>
    <dl class="detail-list"><div><dt>마지막 확인 성공</dt><dd>${formatTime(check?.lastSuccessAt)}</dd></div>
      ${event ? `<div><dt>확인된 신청 상태</dt><dd>${statusLabels[event.kind][0]}</dd></div>` : ''}</dl>
    <div class="button-row">${button(watched ? '관심 해제' : '관심 등록', 'watch', { id: target.id, disabled: accountLoading || accountPending })}
      ${button('이력 보기', 'history', { id: target.id, kind: 'quiet' })}</div>
  </section>`;
}

function renderLocation() {
  const options = targets.filter((target) => target.locationId === selection.id);
  const target = options.find((item) => item.id === targetId);
  return `<div class="detail-header">
      <div class="detail-topline"><button type="button" class="text-button" data-action="close-detail">목록으로</button>${badge('검증용 가상 자료', 'info')}</div>
      <h2 id="location-heading" tabindex="-1">${escape(selection.name)}</h2><p class="muted">${escape(selection.area)}</p>
    </div>
    ${options.length ? `<section class="target-section"><div class="section-title"><h3>등기 대상</h3>${badge(options[0].type)}</div>
      <div class="target-list" aria-label="검증용 등기 대상">${options.map((item) =>
        `<button type="button" class="target-choice${item.id === targetId ? ' selected' : ''}" data-action="target" data-id="${item.id}" aria-pressed="${item.id === targetId}">${escape(targetLabel(item))}</button>`).join('')}</div>
      ${target ? `<p class="target-id">검증 식별번호 ${escape(target.id)}</p>` : ''}
    </section>${target ? renderTargetDetail(target) : ''}` : '<p class="notice">이 위치의 검증용 데이터가 없어요.</p>'}`;
}

function renderPanel() {
  const scrollTop = panel.querySelector('.panel-content')?.scrollTop || 0;
  panel.dataset.sheet = sheet;
  const toggle = sheet === 'closed' ? '펼치기' : sheet === 'expanded' ? '접기' : '펼치기';
  panel.innerHTML = `<div class="sheet-toolbar"><button type="button" class="text-button" data-action="sheet-toggle">${toggle}</button>
    ${sheet !== 'closed' ? '<button type="button" class="text-button" data-action="sheet-close">닫기</button>' : ''}</div>
    <div class="panel-content">${selection ? renderLocation() : renderSearchResults()}</div>`;
  panel.querySelector('.panel-content').scrollTop = scrollTop;
}

function renderWatchPage() {
  if (accountLoading) return '<div class="page-heading"><h1 tabindex="-1">관심 부동산</h1><p role="status">관심 목록을 확인하고 있어요.</p></div>';
  const watched = activeWatches().map((id) => targets.find((target) => target.id === id)).filter(Boolean);
  const name = account?.email || users.find((user) => user.id === state.userId).name;
  const data = registryState();
  return `<div class="page-heading"><h1 tabindex="-1">관심 부동산</h1><p>${escape(name)}의 관심 목록</p></div>
    ${watched.length ? `<div class="record-list">${watched.map((target) => `<div class="record-row">
      <button type="button" class="record-title" data-action="open-target" data-id="${target.id}"><strong>${escape(targetLabel(target))}</strong><span>${account ? '검증용 등기 대상' : `마지막 확인 성공 ${formatTime(data.checks[target.id]?.lastSuccessAt)}`}</span></button>
      <div class="record-actions">${account ? '' : status(data.checks[target.id]?.outcome)}${button('관심 해제', 'watch', { id: target.id, kind: 'quiet', disabled: accountPending })}</div>
    </div>`).join('')}</div>` : `<section class="empty-state"><h2>관심 등록한 부동산이 없어요</h2><p>지도에서 가상 등기 대상을 선택하고 관심 등록해 보세요.</p>${button('지도에서 찾기', 'page', { id: 'map', kind: 'primary' })}</section>`}`;
}

function renderAlertsPage() {
  if (account || accountLoading) return `<div class="page-heading"><h1 tabindex="-1">알림</h1></div><section class="empty-state"><h2>받은 알림이 없어요</h2><p>${accountLoading ? '계정을 확인하고 있어요.' : '실제 등기변동이 연동되면 여기에서 알림을 확인할 수 있어요.'}</p></section>`;
  const alerts = state.notifications.filter((notification) => notification.userId === state.userId);
  return `<div class="page-heading"><h1 tabindex="-1">알림</h1><p>관심 부동산의 모의 등기변동 알림</p></div>
    ${alerts.length ? `<div class="record-list">${alerts.map((alert) => {
      const target = targets.find((item) => item.id === alert.targetId);
      return `<button type="button" class="record-row alert-row${alert.read ? '' : ' unread'}" data-action="open-alert" data-id="${alert.id}">
        <span class="record-title"><strong>${statusLabels[alert.kind][0]}</strong><span>${escape(targetLabel(target))} · ${formatTime(alert.at)}</span></span>
        ${badge(alert.read ? '읽음' : '읽지 않음', alert.read ? 'neutral' : 'info')}</button>`;
    }).join('')}</div>` : `<section class="empty-state"><h2>아직 받은 알림이 없어요</h2><p>관심 부동산을 등록하고 내 정보에서 변동 확인을 실행해 보세요.</p>${button('변동 확인으로 이동', 'page', { id: 'profile' })}</section>`}`;
}

function renderProfilePage() {
  const mapConnection = `<section class="page-section"><div class="section-title"><h2>지도 연결</h2>${badge(mapStatuses[mapStatus][0], mapStatus === 'live' ? 'success' : mapStatus === 'failed' ? 'warning' : 'neutral')}</div>
    <p class="muted">${escape(mapStatuses[mapStatus][1])}</p></section>`;
  const heading = '<div class="page-heading"><h1 tabindex="-1">내 정보</h1></div>';
  if (accountLoading) return `${heading}<p role="status">로그인 상태를 확인하고 있어요.</p>${mapConnection}`;
  if (account) return `${heading}<section class="page-section"><h2>회원 계정</h2>
    <p><strong>${escape(account.email)}</strong></p><p class="muted">검증용 등기 대상의 관심 목록을 계정에 저장해요.</p>
    <div class="button-row">${button('관심 목록 보기', 'page', { id: 'watch' })}${button('로그아웃', 'logout', { kind: 'quiet', disabled: accountPending })}</div>
    </section>${mapConnection}`;

  const submissions = state.submissions.filter((submission) => submission.userId === state.userId);
  const next = rounds[state.round];
  const canRun = Boolean(next && Object.values(state.watches).some((watched) => watched.length));
  return `${heading}<section class="page-section"><h2>회원 계정</h2>
    <p class="muted">로그인하면 다른 브라우저에서도 내 관심 목록을 확인할 수 있어요.</p>
    <div class="button-row">${button('로그인', 'auth', { id: 'login', kind: 'primary' })}${button('회원가입', 'auth', { id: 'register' })}</div></section>
    <section class="page-section"><h2>테스트 사용자</h2><div class="button-row user-switch">${users.map((user) =>
      `<button type="button" class="button ${user.id === state.userId ? 'primary' : 'secondary'}" data-action="user" data-id="${user.id}" aria-pressed="${user.id === state.userId}">${escape(user.name)}</button>`).join('')}</div></section>
    ${mapConnection}
    <section class="page-section"><h2>모의 변동 확인</h2>
      <p class="muted">${next ? `다음 회차 ${escape(next.label)}` : '준비된 조회 회차를 모두 실행했어요.'}</p>
      ${!canRun && next ? '<p class="muted">실행하려면 지도에서 하나 이상의 대상을 관심 등록하세요.</p>' : ''}
      ${state.lastRound ? `<p class="notice" role="status">${escape(state.lastRound.label)} · 대상 ${state.lastRound.count}곳 조회 · 새 알림 ${state.lastRound.newNotifications}건</p>` : ''}
      <div class="button-row">${button('변동 확인 실행', 'run-round', { kind: 'primary', disabled: !canRun })}${button('검증 초기화', 'reset-open', { kind: 'quiet' })}</div>
    </section>
    <section class="page-section"><h2>업로드 이력</h2>
      ${submissions.length ? `<div class="record-list">${submissions.map((item) => {
        const sample = samples.find((value) => value.id === item.sampleId);
        const target = targets.find((value) => value.id === item.targetId);
        return `<div class="record-row"><span class="record-title"><strong>${escape(sample.name)}</strong>
          <span>${escape(targetLabel(target))} · ${formatTime(item.at)}</span></span>
          <div class="record-actions">${status(item.status)}${item.status === 'published' || item.status === 'duplicate' ? button('자료 보기', 'document', { id: item.sampleId, kind: 'quiet' }) : ''}</div></div>`;
      }).join('')}</div>` : '<p class="muted">아직 제출한 가상 자료가 없어요.</p>'}
    </section>`;
}

function render() {
  mapPage.hidden = page !== 'map';
  subPage.hidden = page === 'map';
  for (const tab of document.querySelectorAll('.navigation [data-action="page"]')) {
    if (tab.dataset.id === page) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const unread = account || accountLoading ? 0 : state.notifications.filter((item) => item.userId === state.userId && !item.read).length;
  const count = document.querySelector('#unread-count');
  count.textContent = unread;
  count.hidden = unread === 0;
  if (page === 'map') renderPanel();
  else subPage.innerHTML = { watch: renderWatchPage, alerts: renderAlertsPage, profile: renderProfilePage }[page]();
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
  selection = location;
  targetId = specifiedTarget || targets.find((target) => target.locationId === location.id)?.id || null;
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
  selectLocation(locations.find((location) => location.id === target.locationId), id);
}

function showDialog(title, content) {
  if (!dialog.open) dialogTrigger = document.activeElement;
  dialog.innerHTML = `<div class="dialog-content"><div class="dialog-heading"><h2 id="dialog-title" tabindex="-1">${escape(title)}</h2><button type="button" class="icon-button" data-action="dialog-close" aria-label="닫기">×</button></div>${content}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('#dialog-title').focus({ preventScroll: true });
}

function openAuth(mode) {
  const registration = mode === 'register';
  const label = registration ? '회원가입' : '로그인';
  showDialog(label, `<form id="auth-form" class="auth-form" data-mode="${mode}">
    <label for="auth-email">이메일</label>
    <input id="auth-email" type="email" name="email" maxlength="254" autocomplete="username" required>
    <label for="auth-password">비밀번호</label>
    <input id="auth-password" type="password" name="password" minlength="12" maxlength="128" autocomplete="${registration ? 'new-password' : 'current-password'}" required>
    ${registration ? '<p class="muted">비밀번호는 12자 이상 입력해 주세요.</p>' : ''}
    <p class="upload-feedback" role="status" hidden></p>
    <button type="submit" class="button primary">${label}</button>
  </form>`);
}

async function submitAuth(form) {
  const submit = form.querySelector('button[type="submit"]');
  if (accountPending) return;
  const feedback = form.querySelector('.upload-feedback');
  const mode = form.dataset.mode;
  const data = Object.fromEntries(new FormData(form));
  accountPending = true;
  submit.disabled = true;
  feedback.hidden = true;
  try {
    updateAccount(await accountRequest(`auth/${mode}`, 'POST', data));
    accountPending = false;
    if (dialog.open) dialog.close();
    render();
    refreshPins();
    subPage.querySelector('h1')?.focus({ preventScroll: true });
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
    render();
    refreshPins();
    subPage.querySelector('h1')?.focus({ preventScroll: true });
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
  const watching = !activeWatches().includes(id);
  if (account) {
    accountPending = true;
    control.disabled = true;
    try {
      updateAccount(await accountRequest('watchlist', 'PUT', { accountId: account.id, targetId: id, watched: watching }));
    } catch (error) {
      accountPending = false;
      if (error.status === 401) {
        updateAccount({ user: null, watchlist: [] });
        render();
        refreshPins();
      }
      if (error.status === 409) await refreshAccount();
      notify(error.status ? error.message : '관심 목록을 저장하지 못했어요. 다시 시도해 주세요.');
      return;
    } finally {
      accountPending = false;
      control.disabled = false;
    }
  } else {
    toggleWatch(state, state.userId, id);
    saveState(storage, state);
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
  showDialog('공유 등기 자료', `<p>${escape(targetLabel(target))} ${badge('검증용 가상 자료', 'info')}</p>
    <dl class="detail-list"><div><dt>발급 시각</dt><dd>${formatTime(active.issuedAt)}</dd></div><div><dt>서비스 등록</dt><dd>${formatTime(active.registeredAt)}</dd></div></dl>
    <div class="document-section"><h3>표제부</h3><p>${escape(target.type)} · ${escape(targetLabel(target))}</p></div>
    <div class="document-section"><h3>갑구</h3><p>소유권 · ${escape(active.owner)}</p></div>
    <div class="document-section"><h3>을구</h3><p>${active.amount === null ? '이 샘플에는 표시할 근저당권 항목이 없어요.' : `근저당권 채권최고액 <strong>${money.format(active.amount)}원</strong>`}</p></div>
    <div class="button-row"><a class="button sample-link secondary" href="/samples/${sampleFilename(sample)}" download>예시 원본 받기</a>${button('이력 보기', 'history', { id: target.id, kind: 'quiet' })}</div>`);
}

function openHistory(id) {
  const target = targets.find((item) => item.id === id);
  if (!target) return;
  const data = registryState();
  const documents = documentsFor(data, id);
  const events = [...eventsFor(data, id)].reverse();
  showDialog('등기 이력', `<p>${escape(targetLabel(target))} ${badge('검증용 가상 자료', 'info')}</p>
    <section class="document-section"><h3>문서 버전</h3>
      ${documents.length ? `<ul class="history-list">${documents.map((item, index) => `<li>
        <div class="history-entry"><strong>${escape(item.name)}</strong>${index === 0 ? badge('최신', 'info') : ''}</div>
        <p>발급 ${formatTime(item.issuedAt)}<br>등록 ${formatTime(item.registeredAt)}</p>
        ${button('자료 보기', 'document', { id: item.sampleId, kind: 'quiet' })}</li>`).join('')}</ul>` : '<p>공유된 문서 버전이 없어요.</p>'}
    </section>
    <section class="document-section"><h3>등기변동 이력</h3>
      ${events.length ? `<ul class="history-list">${events.map((item) => `<li><div class="history-entry">${status(item.kind)}<time datetime="${item.at}">${formatTime(item.at)}</time></div></li>`).join('')}</ul>` : '<p>확인된 변동 이력이 없어요.</p>'}
    </section>`);
}

function openShare() {
  const target = targets.find((item) => item.id === targetId);
  const suggested = samples.filter((sample) => sample.targetId === target.id);
  const allSamples = [...suggested, ...samples.filter((sample) => sample.targetId !== target.id)];
  showDialog('등기 자료 공유', `<p><strong>${escape(targetLabel(target))}</strong></p>
    <p class="muted" id="sample-file-hint">예시 PDF 또는 PNG 파일을 올려 주세요. 파일은 브라우저에서 확인해요.</p>
    <form id="sample-form"><label for="sample-file">검증용 파일</label>
      <input id="sample-file" name="sample" type="file" accept=".pdf,.png,application/pdf,image/png" aria-describedby="sample-file-hint" required>
      <p class="upload-feedback" role="status" hidden></p>
      <button type="submit" class="button primary">파일 업로드</button></form>
    <details class="sample-files"><summary>예시 파일 내려받기</summary>
      <ul>${allSamples.map((sample) => `<li><a href="/samples/${sampleFilename(sample)}" download>${escape(sample.name)} <span>${sample.format === 'PDF' ? 'PDF' : 'PNG'}</span></a></li>`).join('')}</ul>
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
  const selectedUser = state.userId;
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
    submit.textContent = '파일 업로드';
  }
}

dialog.addEventListener('change', (event) => {
  if (event.target.id === 'sample-file') dialog.querySelector('.upload-feedback').hidden = true;
});

function changePage(value) {
  page = value;
  render();
  if (page === 'map') refreshPins();
  else subPage.querySelector('h1')?.focus({ preventScroll: true });
}

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
  selection = null;
  targetId = null;
  renderPanel();
  panel.querySelector('.panel-content').scrollTop = 0;
  refreshPins();
  map.showResults?.(results);
});

dialog.addEventListener('close', () => {
  if (dialogTrigger?.isConnected) dialogTrigger.focus({ preventScroll: true });
});

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action, id } = control.dataset;
  switch (action) {
    case 'page': changePage(id); break;
    case 'location': selectLocation(results.find((location) => location.id === id)); break;
    case 'target':
      targetId = id;
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
    case 'dialog-close': dialog.close(); break;
    case 'document': openDocument(id); break;
    case 'history': openHistory(id); break;
    case 'share': openShare(); break;
    case 'auth': openAuth(id); break;
    case 'logout': void logout(control); break;
    case 'watch': void changeWatch(id, control); break;
    case 'user':
      state.userId = id;
      saveState(storage, state);
      render();
      subPage.querySelector('[data-action="user"][aria-pressed="true"]')?.focus({ preventScroll: true });
      break;
    case 'run-round': {
      const result = runRound(state);
      if (!result) break;
      saveState(storage, state);
      render();
      subPage.querySelector('[data-action="run-round"]:enabled')?.focus({ preventScroll: true });
      break;
    }
    case 'open-alert': {
      const alert = state.notifications.find((item) => item.id === id && item.userId === state.userId);
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
