import { locations, rounds, samples, targetLabel, targets, users } from './fixtures.js';
import { documentsFor, initialState, loadState, needsUpdate, runRound, saveState, submitSample, toggleWatch } from './model.js';
import { connectKakaoMap, createDemoMap } from './map.js';

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

const statusLabels = {
  published: ['공유 완료', 'success'], duplicate: ['이미 공유된 자료', 'info'], mismatch: ['등기 대상 불일치', 'warning'],
  review: ['검수 보류', 'warning'], unreadable: ['등기 대상 식별 불가', 'danger'],
  'no-change': ['새 변동 미감지', 'neutral'], failure: ['최근 조회 실패', 'danger'],
  received: ['등기신청 접수', 'info'], completed: ['등기 완료', 'info'],
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

function documentStatus(locationId) {
  const matching = targets.filter((target) => target.locationId === locationId);
  if (!matching.length) return '';
  return state.documents.some((document) => matching.some((target) => target.id === document.targetId)) ? '공유 자료 있음' : '공유 자료 없음';
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
  const documents = documentsFor(state, target.id);
  const latest = documents[0];
  const check = state.checks[target.id];
  const event = state.events[target.id];
  const watched = state.watches[state.userId].includes(target.id);
  return `<section class="detail-section"><div class="section-title"><h3>공유 등기 자료</h3>${needsUpdate(state, target.id) ? badge('문서 갱신 필요', 'warning') : ''}</div>
    ${latest ? `<dl class="detail-list"><div><dt>발급 시각</dt><dd>${formatTime(latest.issuedAt)}</dd></div><div><dt>서비스 등록</dt><dd>${formatTime(latest.registeredAt)}</dd></div></dl>
      <div class="button-row">${button('공유 등기 보기', 'document', { id: latest.sampleId, kind: 'primary' })}${button('등기 자료 공유', 'share')}</div>` :
      `<p class="muted">공유된 검증용 자료가 없어요.</p>${button('등기 자료 공유', 'share', { kind: 'primary' })}`}
  </section>
  <section class="detail-section"><div class="section-title"><h3>변동 확인</h3>${status(check?.outcome)}</div>
    <dl class="detail-list"><div><dt>마지막 확인 성공</dt><dd>${formatTime(check?.lastSuccessAt)}</dd></div>
      ${event ? `<div><dt>확인된 신청 상태</dt><dd>${statusLabels[event.kind][0]}</dd></div>` : ''}</dl>
    ${button(watched ? '관심 해제' : '관심 등록', 'watch', { id: target.id })}
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
  const watched = state.watches[state.userId].map((id) => targets.find((target) => target.id === id));
  return `<div class="page-heading"><h1 tabindex="-1">관심 부동산</h1><p>${escape(users.find((user) => user.id === state.userId).name)}의 관심 목록</p></div>
    ${watched.length ? `<div class="record-list">${watched.map((target) => `<div class="record-row">
      <button type="button" class="record-title" data-action="open-target" data-id="${target.id}"><strong>${escape(targetLabel(target))}</strong><span>마지막 확인 성공 ${formatTime(state.checks[target.id]?.lastSuccessAt)}</span></button>
      <div class="record-actions">${status(state.checks[target.id]?.outcome)}${button('관심 해제', 'watch', { id: target.id, kind: 'quiet' })}</div>
    </div>`).join('')}</div>` : `<section class="empty-state"><h2>관심 등록한 부동산이 없어요</h2><p>지도에서 가상 등기 대상을 선택하고 관심 등록해 보세요.</p>${button('지도에서 찾기', 'page', { id: 'map', kind: 'primary' })}</section>`}`;
}

function renderAlertsPage() {
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
  const submissions = state.submissions.filter((submission) => submission.userId === state.userId);
  const next = rounds[state.round];
  const canRun = Boolean(next && Object.values(state.watches).some((watched) => watched.length));
  return `<div class="page-heading"><h1 tabindex="-1">내 정보</h1><p>테스트 사용자를 전환하고 검증 시나리오를 실행할 수 있어요.</p></div>
    <section class="page-section"><h2>테스트 사용자</h2><div class="button-row user-switch">${users.map((user) =>
      `<button type="button" class="button ${user.id === state.userId ? 'primary' : 'secondary'}" data-action="user" data-id="${user.id}" aria-pressed="${user.id === state.userId}">${escape(user.name)}</button>`).join('')}</div></section>
    <section class="page-section"><h2>모의 변동 확인</h2>
      <p class="muted">${next ? `다음 회차 ${escape(next.label)}` : '준비된 조회 회차를 모두 실행했어요.'}</p>
      ${!canRun && next ? '<p class="muted">실행하려면 지도에서 하나 이상의 대상을 관심 등록하세요.</p>' : ''}
      ${state.lastRound ? `<p class="notice" role="status">${escape(state.lastRound.label)} · 대상 ${state.lastRound.count}곳 조회 · 새 알림 ${state.lastRound.newNotifications}건</p>` : ''}
      <div class="button-row">${button('변동 확인 실행', 'run-round', { kind: 'primary', disabled: !canRun })}${button('검증 초기화', 'reset-open', { kind: 'quiet' })}</div>
    </section>
    <section class="page-section"><h2>내가 공유한 자료</h2>
      ${submissions.length ? `<div class="record-list">${submissions.map((item) => `<div class="record-row"><span class="record-title"><strong>${escape(samples.find((sample) => sample.id === item.sampleId).name)}</strong><span>${formatTime(item.at)}</span></span>${status(item.status)}</div>`).join('')}</div>` : '<p class="muted">아직 제출한 가상 자료가 없어요.</p>'}
    </section>`;
}

function render() {
  mapPage.hidden = page !== 'map';
  subPage.hidden = page === 'map';
  for (const tab of document.querySelectorAll('.navigation [data-action="page"]')) {
    if (tab.dataset.id === page) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const unread = state.notifications.filter((item) => item.userId === state.userId && !item.read).length;
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
  dialog.innerHTML = `<div class="dialog-content"><div class="dialog-heading"><h2 id="dialog-title">${escape(title)}</h2><button type="button" class="icon-button" data-action="dialog-close" aria-label="닫기">×</button></div>${content}</div>`;
  if (!dialog.open) dialog.showModal();
}

function openDocument(id) {
  const documents = documentsFor(state, targetId);
  const active = documents.find((item) => item.sampleId === id) || documents[0];
  if (!active) return;
  const target = targets.find((item) => item.id === targetId);
  showDialog('공유 등기 자료', `<p>${escape(targetLabel(target))} ${badge('검증용 가상 자료', 'info')}</p>
    <dl class="detail-list"><div><dt>발급 시각</dt><dd>${formatTime(active.issuedAt)}</dd></div><div><dt>서비스 등록</dt><dd>${formatTime(active.registeredAt)}</dd></div></dl>
    <div class="document-section"><h3>표제부</h3><p>${escape(target.type)} · ${escape(targetLabel(target))}</p></div>
    <div class="document-section"><h3>갑구</h3><p>소유권 · ${escape(active.owner)}</p></div>
    <div class="document-section"><h3>을구</h3><p>${active.amount === null ? '이 샘플에는 표시할 근저당권 항목이 없어요.' : `근저당권 채권최고액 <strong>${money.format(active.amount)}원</strong>`}</p></div>
    ${documents.length > 1 ? `<div class="document-section"><h3>문서 버전</h3><div class="version-list">${documents.map((item) => button(`${item.name} · ${formatTime(item.issuedAt)}`, 'document', { id: item.sampleId, disabled: item.sampleId === active.sampleId, kind: 'quiet' })).join('')}</div></div>` : ''}`);
}

function openShare() {
  const target = targets.find((item) => item.id === targetId);
  showDialog('등기 자료 공유', `<p><strong>${escape(targetLabel(target))}</strong></p>
    <p class="muted">서비스 검증용 샘플과 미리 정의된 검수 결과를 사용해요.</p>
    <form id="sample-form"><label for="sample-choice">검증용 샘플</label><select id="sample-choice" name="sample" required>
      <option value="">샘플을 선택하세요</option>${samples.map((sample) => `<option value="${sample.id}">${escape(sample.name)} (${sample.format})</option>`).join('')}
    </select><button type="submit" class="button primary">샘플 제출</button></form>`);
}

function changePage(value) {
  page = value;
  render();
  if (page === 'map') refreshPins();
  else subPage.querySelector('h1')?.focus({ preventScroll: true });
}

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'sample-form') {
    event.preventDefault();
    const sampleId = new FormData(event.target).get('sample');
    const submission = submitSample(state, state.userId, targetId, sampleId);
    if (!submission) return;
    saveState(storage, state);
    dialog.close();
    render();
    refreshPins();
    panel.querySelector('[data-action="share"]')?.focus({ preventScroll: true });
    notify(statusLabels[submission.status][0]);
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
    case 'share': openShare(); break;
    case 'watch': {
      const watching = toggleWatch(state, state.userId, id);
      saveState(storage, state);
      render();
      if (page === 'map') panel.querySelector('[data-action="watch"]')?.focus({ preventScroll: true });
      else subPage.querySelector('h1')?.focus({ preventScroll: true });
      notify(watching ? '관심 부동산으로 등록했어요.' : '관심 등록을 해제했어요.');
      break;
    }
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
const liveContainer = document.querySelector('#map-live');
connectKakaoMap(liveContainer, selectLocation).then((liveMap) => {
  if (!liveMap) return;
  map = liveMap;
  liveContainer.hidden = false;
  document.querySelector('#map-demo').hidden = true;
  document.querySelector('#map-mode').textContent = '카카오맵';
  document.querySelector('#map-caption').hidden = true;
  refreshPins();
  if (selection) map.select(selection);
}).catch(() => {
  liveContainer.hidden = true;
  document.querySelector('#map-mode').textContent = '지도 연결 실패 · 검증용 지도';
});
