/**
 * Side panel UI — task navigation graph + zh/en i18n; quick search off by default.
 */
import { withDeadline } from '../shared/async-timeout.js';
import { GROUP_RPC_TIMEOUT_MS, MSG, REFINE_STALL_MS } from '../shared/constants.js';
import { buildCloseGroupPayload } from '../shared/close-group.js';
import {
  applyDomI18n,
  createTranslator,
  detectBrowserLocale,
  formatWindowBadge,
  resolveLocale,
} from '../shared/i18n.js';
import { nextPanelView, panelViewState } from '../shared/settings-panel.js';
import {
  buildTaskFeedbackPayload,
  consumeDragClickSuppress,
  dragStartPayload,
  handleTaskDrop,
  planMergePrev,
} from '../shared/drag-merge.js';

const $ = (id) => document.getElementById(id);

const nanoStatusEl = $('nano-status');
const nanoDetailEl = $('nano-detail');
const btnDownload = $('btn-download-nano');
const toggleDedupe = $('toggle-dedupe');
const toggleIgnoreHash = $('toggle-ignore-hash');
const toggleAutoGroup = $('toggle-auto-group');
const toggleQuickSearch = $('toggle-quick-search');
const searchCard = $('search-card');
const customBaseUrl = $('custom-base-url');
const customApiKey = $('custom-api-key');
const customModel = $('custom-model');
const btnSaveCustom = $('btn-save-custom');
const btnGroupNow = $('btn-group-now');
const btnRefreshTasks = $('btn-refresh-tasks');
const scopeAll = $('scope-all');
const scopeCurrent = $('scope-current');
const taskClustersEl = $('task-clusters');
const taskEmpty = $('task-empty');
const actionResult = $('action-result');
const groupProgressEl = $('group-progress');
const groupProgressFill = $('group-progress-fill');
const groupProgressText = $('group-progress-text');
const fallbackHint = $('fallback-hint');
const btnSettings = $('btn-settings');
const btnBackSettings = $('btn-back-settings');
const settingsPanelEl = $('settings-panel');
const taskViewCard = $('task-view-card');
const panelHintEl = $('panel-hint');
const searchInput = $('search-input');
const searchResults = $('search-results');
const searchEmpty = $('search-empty');
const localeAuto = $('locale-auto');
const localeZh = $('locale-zh');
const localeEn = $('locale-en');

const AVAIL_KEYS = {
  available: { key: 'nanoAvailable', cls: 'badge-ok' },
  readily: { key: 'nanoAvailable', cls: 'badge-ok' },
  downloadable: { key: 'nanoDownloadable', cls: 'badge-warn' },
  downloading: { key: 'nanoDownloading', cls: 'badge-warn' },
  unavailable: { key: 'nanoUnavailable', cls: 'badge-bad' },
  missing: { key: 'nanoMissing', cls: 'badge-bad' },
};

/** @type {'auto'|'zh'|'en'} */
let uiLocalePref = 'auto';
let translate = createTranslator(resolveLocale('auto', detectBrowserLocale()));
/** @param {string} key @param {Record<string, unknown>} [vars] */
function t(key, vars) {
  return translate(key, vars);
}

/** @type {{ kind: string, tabId?: number, windowId?: number, url?: string, title?: string }[]} */
let flatResults = [];
let activeIndex = -1;
let searchTimer = 0;
let quickSearchOn = false;
/** @type {{ id: string, label: string, tabs: any[], edges?: any }[]} */
let viewClusters = [];
let allWindowsView = true;
/** @type {number | null} */
let viewCurrentWindowId = null;
/** @type {'tasks'|'settings'} */
let panelView = 'tasks';
/** @type {any} */
let lastTaskViewRes = null;
/** @type {string} */
let lastNanoAvail = 'unavailable';

init();

async function init() {
  bind();
  await loadSettings();
  await refreshNano();
  await refreshTaskView();
  if (quickSearchOn) {
    searchInput.focus();
    await runSearch('');
  }
}

function bind() {
  btnDownload.addEventListener('click', onDownloadNano);
  toggleDedupe.addEventListener('change', () =>
    savePartial({ exactDedupeEnabled: toggleDedupe.checked }),
  );
  toggleIgnoreHash.addEventListener('change', () =>
    savePartial({ ignoreHash: toggleIgnoreHash.checked }),
  );
  toggleAutoGroup.addEventListener('change', () =>
    savePartial({ autoSemanticGroupEnabled: toggleAutoGroup.checked }),
  );
  toggleQuickSearch.addEventListener('change', async () => {
    await savePartial({ quickSearchEnabled: toggleQuickSearch.checked });
    applyQuickSearchVisibility(toggleQuickSearch.checked);
    if (toggleQuickSearch.checked) {
      searchInput.focus();
      await runSearch(searchInput.value || '');
    }
  });
  btnSaveCustom.addEventListener('click', onSaveCustom);
  btnSettings?.addEventListener('click', () => {
    setPanelView(nextPanelView(panelView, 'open-settings'));
  });
  btnBackSettings?.addEventListener('click', () => {
    setPanelView(nextPanelView(panelView, 'back-to-tasks'));
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && panelView === 'settings') {
      setPanelView(nextPanelView(panelView, 'escape'));
    }
  });
  applyPanelView();
  btnGroupNow.addEventListener('click', onGroupNow);
  btnRefreshTasks.addEventListener('click', () => void refreshTaskView());
  scopeAll.addEventListener('change', onScopeChange);
  scopeCurrent.addEventListener('change', onScopeChange);
  localeAuto?.addEventListener('change', onLocaleChange);
  localeZh?.addEventListener('change', onLocaleChange);
  localeEn?.addEventListener('change', onLocaleChange);
  taskClustersEl.addEventListener('click', onTaskClustersClick);
  taskClustersEl.addEventListener('dragstart', onTaskDragStart);
  taskClustersEl.addEventListener('dragend', onTaskDragEnd);
  taskClustersEl.addEventListener('dragover', onTaskDragOver);
  taskClustersEl.addEventListener('dragleave', onTaskDragLeave);
  taskClustersEl.addEventListener('drop', onTaskDrop);

  let viewTimer = 0;
  const scheduleViewRefresh = () => {
    clearTimeout(viewTimer);
    viewTimer = setTimeout(() => void refreshTaskView(), 250);
  };
  chrome.tabs.onCreated.addListener(scheduleViewRefresh);
  chrome.tabs.onRemoved.addListener(scheduleViewRefresh);
  chrome.windows.onFocusChanged.addListener(scheduleViewRefresh);

  searchInput.addEventListener('input', () => {
    if (!quickSearchOn) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(searchInput.value), 80);
  });
  searchInput.addEventListener('keydown', onSearchKeydown);
  searchResults.addEventListener('click', onResultsClick);
}

/** @param {'tasks'|'settings'} view */
function setPanelView(view) {
  panelView = view === 'settings' ? 'settings' : 'tasks';
  applyPanelView();
}

function applyLocale() {
  const locale = resolveLocale(uiLocalePref, detectBrowserLocale());
  translate = createTranslator(locale);
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  applyDomI18n(document, t);
  applyPanelView();
}

function applyLocaleRadios() {
  if (localeAuto) localeAuto.checked = uiLocalePref === 'auto';
  if (localeZh) localeZh.checked = uiLocalePref === 'zh';
  if (localeEn) localeEn.checked = uiLocalePref === 'en';
}

async function onLocaleChange() {
  const next = localeEn?.checked ? 'en' : localeZh?.checked ? 'zh' : 'auto';
  uiLocalePref = next;
  applyLocaleRadios();
  applyLocale();
  await savePartial({ uiLocale: uiLocalePref });
  await refreshNano();
  if (lastTaskViewRes) renderTaskView(lastTaskViewRes);
  if (quickSearchOn) await runSearch(searchInput.value || '');
}

function applyPanelView() {
  const state = panelViewState(panelView, { quickSearchOn, t });
  if (settingsPanelEl) settingsPanelEl.hidden = state.settingsHidden;
  if (taskViewCard) taskViewCard.hidden = state.taskHidden;
  if (searchCard) searchCard.hidden = state.searchHidden;
  if (panelHintEl) panelHintEl.hidden = state.headerHintHidden;
  if (btnSettings) {
    btnSettings.title = state.settingsTrigger.title;
    btnSettings.setAttribute('aria-label', state.settingsTrigger['aria-label']);
    btnSettings.setAttribute('aria-pressed', state.settingsTrigger['aria-pressed']);
    btnSettings.setAttribute('aria-controls', state.settingsTrigger['aria-controls']);
  }
  if (btnBackSettings) {
    btnBackSettings.title = state.back.title;
    btnBackSettings.setAttribute('aria-label', state.back['aria-label']);
  }
}

function applyQuickSearchVisibility(enabled) {
  quickSearchOn = !!enabled;
  applyPanelView();
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 * @param {number} [timeoutMs]
 */
async function send(type, payload, timeoutMs = GROUP_RPC_TIMEOUT_MS) {
  return withDeadline(
    chrome.runtime.sendMessage({ type, payload }),
    timeoutMs,
    t('rpcTimeout'),
  );
}

async function runSearch(query) {
  if (!quickSearchOn) return;
  try {
    const res = await send(MSG.SEARCH_TABS, { query, limit: 30 });
    renderResults(res?.open || [], res?.closed || []);
  } catch (err) {
    searchResults.innerHTML = '';
    flatResults = [];
    searchEmpty.hidden = false;
    searchEmpty.textContent = err instanceof Error ? err.message : String(err);
  }
}

/**
 * @param {any[]} openHits
 * @param {any[]} closedHits
 */
function renderResults(openHits, closedHits) {
  flatResults = [];
  activeIndex = -1;
  searchResults.innerHTML = '';

  const frag = document.createDocumentFragment();

  if (openHits.length) {
    frag.appendChild(sectionLabel(t('searchOpenSection')));
    for (const hit of openHits) {
      flatResults.push(hit);
      frag.appendChild(resultButton(hit, flatResults.length - 1));
    }
  }
  if (closedHits.length) {
    frag.appendChild(sectionLabel(t('searchClosedSection')));
    for (const hit of closedHits) {
      flatResults.push(hit);
      frag.appendChild(resultButton(hit, flatResults.length - 1));
    }
  }

  searchResults.appendChild(frag);
  const empty = flatResults.length === 0;
  searchEmpty.hidden = !empty;
  searchEmpty.textContent = empty
    ? searchInput.value.trim()
      ? t('searchNoMatch')
      : t('searchNoTabs')
    : '';
}

function sectionLabel(text) {
  const el = document.createElement('div');
  el.className = 'search-section-label';
  el.textContent = text;
  return el;
}

/** @param {any} hit @param {number} index */
function resultButton(hit, index) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'search-item';
  btn.dataset.index = String(index);
  btn.setAttribute('role', 'option');

  const fav = document.createElement('img');
  fav.className = 'fav';
  fav.width = 16;
  fav.height = 16;
  fav.alt = '';
  if (hit.favIconUrl && hit.favIconUrl.startsWith('http')) {
    fav.src = hit.favIconUrl;
    fav.addEventListener('error', () => {
      fav.removeAttribute('src');
    });
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = hit.title || hit.url || '';
  const url = document.createElement('span');
  url.className = 'url';
  url.textContent = hit.url || '';
  meta.append(title, url);

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = hit.kind === 'open' ? t('searchTagOpen') : t('searchTagClosed');

  btn.append(fav, meta, tag);
  return btn;
}

function onResultsClick(ev) {
  const btn = ev.target.closest('.search-item');
  if (!btn) return;
  const index = Number(btn.dataset.index);
  void activateIndex(index);
}

/** @param {KeyboardEvent} ev */
function onSearchKeydown(ev) {
  if (!quickSearchOn) return;
  if (!flatResults.length) {
    if (ev.key === 'Escape') {
      searchInput.value = '';
      void runSearch('');
    }
    return;
  }

  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    setActiveIndex(activeIndex < flatResults.length - 1 ? activeIndex + 1 : 0);
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    setActiveIndex(activeIndex <= 0 ? flatResults.length - 1 : activeIndex - 1);
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    const idx = activeIndex >= 0 ? activeIndex : 0;
    void activateIndex(idx);
  } else if (ev.key === 'Escape') {
    searchInput.value = '';
    void runSearch('');
  }
}

/** @param {number} index */
function setActiveIndex(index) {
  activeIndex = index;
  const items = searchResults.querySelectorAll('.search-item');
  items.forEach((el, i) => {
    el.classList.toggle('is-active', i === index);
    if (i === index) el.scrollIntoView({ block: 'nearest' });
  });
}

/** @param {number} index */
async function activateIndex(index) {
  const hit = flatResults[index];
  if (!hit) return;
  try {
    await send(MSG.ACTIVATE_SEARCH_RESULT, {
      kind: hit.kind,
      tabId: hit.tabId,
      windowId: hit.windowId,
      url: hit.url,
    });
    // Side panel stays open after activating a result
  } catch (err) {
    actionResult.textContent = err instanceof Error ? err.message : String(err);
  }
}

async function refreshNano() {
  try {
    const res = await send(MSG.GET_NANO_STATUS);
    const avail = res?.availability || 'unavailable';
    lastNanoAvail = avail;
    const meta = AVAIL_KEYS[avail] || AVAIL_KEYS.unavailable;
    nanoStatusEl.textContent = t(meta.key);
    nanoStatusEl.className = `badge ${meta.cls}`;
    nanoDetailEl.textContent = res?.detail || statusHint(avail);

    const needDownload = avail === 'downloadable' || avail === 'downloading';
    btnDownload.hidden = !needDownload;
    btnDownload.disabled = avail === 'downloading';

    updateFallbackHint(avail);
  } catch (err) {
    lastNanoAvail = 'missing';
    nanoStatusEl.textContent = t('nanoDetectFailed');
    nanoStatusEl.className = 'badge badge-bad';
    nanoDetailEl.textContent = err instanceof Error ? err.message : String(err);
    btnDownload.hidden = true;
    updateFallbackHint('missing');
  }
}

function statusHint(avail) {
  switch (avail) {
    case 'available':
    case 'readily':
      return t('nanoHintAvailable');
    case 'downloadable':
      return t('nanoHintDownloadable');
    case 'downloading':
      return t('nanoHintDownloading');
    case 'unavailable':
      return t('nanoHintUnavailable');
    case 'missing':
      return t('nanoHintMissing');
    default:
      return '';
  }
}

function updateFallbackHint(avail) {
  const nanoOk = avail === 'available' || avail === 'readily';
  if (nanoOk) {
    fallbackHint.textContent = '';
    return;
  }
  const hasCustom = !!(customBaseUrl.value && customApiKey.value);
  if (hasCustom) {
    fallbackHint.textContent = t('fallbackCustom');
  } else {
    fallbackHint.textContent = t('fallbackHeuristic');
  }
}

async function onDownloadNano() {
  btnDownload.disabled = true;
  btnDownload.textContent = t('nanoDownloadingBtn');
  if (nanoDetailEl) nanoDetailEl.textContent = t('nanoDownloadingBtn');
  try {
    const res = await send(MSG.DOWNLOAD_NANO);
    if (nanoDetailEl) {
      nanoDetailEl.textContent = res?.ok
        ? t('nanoDownloadOk')
        : t('nanoDownloadFail', { error: res?.error || t('unknownError') });
    }
  } catch (err) {
    if (nanoDetailEl) {
      nanoDetailEl.textContent = err instanceof Error ? err.message : String(err);
    }
  } finally {
    btnDownload.textContent = t('nanoDownloadBtn');
    await refreshNano();
  }
}

async function loadSettings() {
  const res = await send(MSG.GET_SETTINGS);
  const s = res?.settings || {};
  toggleDedupe.checked = s.exactDedupeEnabled !== false;
  toggleIgnoreHash.checked = s.ignoreHash === true;
  toggleAutoGroup.checked = s.autoSemanticGroupEnabled !== false;
  toggleQuickSearch.checked = s.quickSearchEnabled === true;
  allWindowsView = s.allWindowsViewEnabled !== false;
  scopeAll.checked = allWindowsView;
  scopeCurrent.checked = !allWindowsView;
  applyQuickSearchVisibility(toggleQuickSearch.checked);
  customBaseUrl.value = s.customBaseUrl || '';
  customApiKey.value = s.customApiKey || '';
  customModel.value = s.customModel || 'gpt-4o-mini';
  uiLocalePref = s.uiLocale === 'zh' || s.uiLocale === 'en' ? s.uiLocale : 'auto';
  applyLocaleRadios();
  applyLocale();
  updateFallbackHint(lastNanoAvail);
}

async function savePartial(partial) {
  await send(MSG.SAVE_SETTINGS, partial);
}

async function onSaveCustom() {
  btnSaveCustom.disabled = true;
  try {
    await savePartial({
      customBaseUrl: customBaseUrl.value.trim(),
      customApiKey: customApiKey.value.trim(),
      customModel: customModel.value.trim() || 'gpt-4o-mini',
    });
    await refreshNano();
    if (fallbackHint) fallbackHint.textContent = t('customSaved');
  } finally {
    btnSaveCustom.disabled = false;
  }
}

async function onScopeChange() {
  allWindowsView = !!scopeAll.checked;
  await savePartial({ allWindowsViewEnabled: allWindowsView });
  await refreshTaskView();
}

async function refreshTaskView() {
  try {
    const res = await send(MSG.GET_TASK_VIEW, { allWindows: allWindowsView });
    renderTaskView(res);
  } catch (err) {
    taskClustersEl.hidden = true;
    taskEmpty.hidden = false;
    taskEmpty.textContent = err instanceof Error ? err.message : String(err);
  }
}

/** @param {any} res */
function renderTaskView(res) {
  lastTaskViewRes = res;
  viewClusters = res?.clusters || [];
  viewCurrentWindowId = res?.currentWindowId ?? null;
  taskClustersEl.innerHTML = '';
  if (!viewClusters.length) {
    taskClustersEl.hidden = true;
    taskEmpty.hidden = false;
    taskEmpty.textContent = allWindowsView ? t('taskEmptyAll') : t('taskEmptyCurrent');
    return;
  }
  taskEmpty.hidden = true;
  taskClustersEl.hidden = false;
  const frag = document.createDocumentFragment();
  viewClusters.forEach((cluster, index) => {
    frag.appendChild(renderCluster(cluster, index));
  });
  taskClustersEl.appendChild(frag);
}

/** @param {any} cluster @param {number} index */
function renderCluster(cluster, index) {
  const wrap = document.createElement('div');
  wrap.className = 'task-cluster';
  wrap.dataset.clusterId = cluster.id;
  wrap.draggable = true;

  const head = document.createElement('div');
  head.className = 'task-cluster-head';
  const headText = document.createElement('div');
  headText.className = 'task-cluster-head-text';
  const title = document.createElement('div');
  title.className = 'task-cluster-title';
  const winNote = cluster.windowIds && cluster.windowIds.length > 1 ? t('clusterCrossWindow') : '';
  title.textContent =
    t('clusterTitle', { label: cluster.label || t('uncategorized'), n: cluster.tabs.length }) + winNote;
  const meta = document.createElement('div');
  meta.className = 'task-cluster-meta';
  meta.textContent = edgeSummary(cluster.edges);
  headText.append(title, meta);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn-text btn-close-group';
  closeBtn.dataset.action = 'close-group';
  closeBtn.dataset.clusterId = cluster.id;
  closeBtn.dataset.index = String(index);
  closeBtn.textContent = t('closeGroup');
  closeBtn.title = t('closeGroup');
  closeBtn.setAttribute('aria-label', t('closeGroup'));
  head.append(headText, closeBtn);

  const actions = document.createElement('div');
  actions.className = 'task-cluster-actions';
  if (index > 0) {
    const mergeBtn = document.createElement('button');
    mergeBtn.type = 'button';
    mergeBtn.className = 'btn-text';
    mergeBtn.dataset.action = 'merge-prev';
    mergeBtn.dataset.index = String(index);
    mergeBtn.textContent = t('mergePrev');
    actions.appendChild(mergeBtn);
  }
  const dragHint = document.createElement('span');
  dragHint.className = 'drag-hint';
  dragHint.textContent = t('dragHint');
  actions.appendChild(dragHint);
  if (cluster.tabs.length > 1) {
    const splitBtn = document.createElement('button');
    splitBtn.type = 'button';
    splitBtn.className = 'btn-text';
    splitBtn.dataset.action = 'split';
    splitBtn.dataset.index = String(index);
    splitBtn.textContent = t('splitTask');
    actions.appendChild(splitBtn);
  }

  const list = document.createElement('div');
  list.className = 'task-tab-list';
  for (const tab of cluster.tabs) {
    list.appendChild(renderTaskTab(tab));
  }

  wrap.append(head, actions, list);
  return wrap;
}

/** @param {any} tab */
function renderTaskTab(tab) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'task-tab';
  btn.dataset.tabId = String(tab.tabId);
  btn.dataset.windowId = String(tab.windowId);
  btn.draggable = true;

  const badge = document.createElement('span');
  badge.className = 'win-badge';
  badge.textContent = formatWindowBadge(tab.windowBadge, t);

  const meta = document.createElement('span');
  meta.className = 'meta';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = tab.title || tab.url || '';
  const url = document.createElement('span');
  url.className = 'url';
  url.textContent = tab.url || '';
  meta.append(title, url);

  btn.append(badge, meta);
  return btn;
}

/** @param {any} edges */
function edgeSummary(edges) {
  if (!edges) return t('edgeGraph');
  const parts = [];
  if (edges.opener) parts.push(t('edgeOpener', { n: edges.opener }));
  if (edges.referrer) parts.push(t('edgeReferrer', { n: edges.referrer }));
  if (edges.project) parts.push(t('edgeProject', { n: edges.project }));
  if (edges.time) parts.push(t('edgeTime', { n: edges.time }));
  if (edges.learned) parts.push(t('edgeLearned', { n: edges.learned }));
  if (edges.feedback) parts.push(t('edgeFeedback', { n: edges.feedback }));
  if (edges.model) parts.push(t('edgeModel', { n: edges.model }));
  return parts.length ? parts.join(' · ') : t('edgeSolo');
}

let suppressTabClick = false;

/** @param {DragEvent} ev */
function onTaskDragStart(ev) {
  if (ev.target.closest?.('[data-action], button.btn-text')) {
    ev.preventDefault();
    return;
  }
  const tabBtn = ev.target.closest?.('.task-tab');
  const cluster = ev.target.closest?.('.task-cluster');
  if (!cluster) return;
  const payload = dragStartPayload({
    isTab: Boolean(tabBtn),
    clusterId: cluster.dataset.clusterId,
    tabId: tabBtn ? Number(tabBtn.dataset.tabId) : undefined,
  });
  if (!payload) return;
  ev.dataTransfer.effectAllowed = 'link';
  ev.dataTransfer.setData('application/json', JSON.stringify(payload));
  ev.dataTransfer.setData('text/plain', JSON.stringify(payload));
  cluster.classList.add('is-dragging');
  suppressTabClick = Boolean(tabBtn);
}

/** @param {DragEvent} ev */
function onTaskDragEnd(ev) {
  ev.target.closest?.('.task-cluster')?.classList.remove('is-dragging');
  taskClustersEl.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
}

/** @param {DragEvent} ev */
function onTaskDragOver(ev) {
  const cluster = ev.target.closest?.('.task-cluster');
  if (!cluster) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'link';
  cluster.classList.add('drag-over');
}

/** @param {DragEvent} ev */
function onTaskDragLeave(ev) {
  const cluster = ev.target.closest?.('.task-cluster');
  if (!cluster) return;
  if (cluster.contains(ev.relatedTarget)) return;
  cluster.classList.remove('drag-over');
}

/** @param {DragEvent} ev */
function onTaskDrop(ev) {
  const cluster = ev.target.closest?.('.task-cluster');
  if (!cluster) return;
  ev.preventDefault();
  cluster.classList.remove('drag-over');
  const plan = handleTaskDrop({
    dataJson: ev.dataTransfer.getData('application/json') || ev.dataTransfer.getData('text/plain') || '',
    targetClusterId: cluster.dataset.clusterId,
    clusters: viewClusters,
  });
  if (!plan) return;
  void sendMergePlan(plan);
}

/** @param {MouseEvent} ev */
function onTaskClustersClick(ev) {
  if (suppressTabClick) {
    const consumed = consumeDragClickSuppress(true, Boolean(ev.target.closest?.('.task-tab')));
    suppressTabClick = consumed.next;
    if (consumed.ignore) {
      ev.preventDefault();
      return;
    }
  }
  const tabBtn = ev.target.closest('.task-tab');
  if (tabBtn) {
    const tabId = Number(tabBtn.dataset.tabId);
    const windowId = Number(tabBtn.dataset.windowId);
    void send(MSG.ACTIVATE_SEARCH_RESULT, { kind: 'open', tabId, windowId });
    return;
  }
  const actionBtn = ev.target.closest('[data-action]');
  if (!actionBtn) return;
  const index = Number(actionBtn.dataset.index);
  const action = actionBtn.dataset.action;
  if (action === 'merge-prev' && index > 0) {
    const plan = planMergePrev(viewClusters, index);
    if (plan) void sendMergePlan(plan);
  } else if (action === 'split') {
    void sendFeedback('split', viewClusters[index], null);
  } else if (action === 'close-group') {
    const cluster =
      viewClusters.find((c) => c.id === actionBtn.dataset.clusterId) || viewClusters[index];
    if (cluster) void sendCloseGroup(cluster);
  }
}

async function sendCloseGroup(cluster) {
  const payload = buildCloseGroupPayload(cluster, {
    allWindows: allWindowsView,
    currentWindowId: viewCurrentWindowId,
  });
  actionResult.textContent = payload.tabIds.length
    ? t('closingTabs', { n: payload.tabIds.length })
    : t('closeNone');
  if (!payload.tabIds.length) return;
  try {
    const res = await send(MSG.CLOSE_TASK_GROUP, payload);
    renderTaskView(res);
    const closed = Number(res?.closed) || 0;
    const gone = Number(res?.alreadyGone) || 0;
    actionResult.textContent =
      closed > 0
        ? t('closedTabs', { n: closed })
        : gone > 0
          ? t('closeAlreadyGone')
          : t('closeNothing');
  } catch (err) {
    actionResult.textContent = err instanceof Error ? err.message : String(err);
  }
}

async function sendMergePlan(plan) {
  const payload = buildTaskFeedbackPayload(plan, { allWindows: allWindowsView });
  if (!payload) return;
  return sendFeedbackPayload(payload.action, payload.tabIds, payload.urlsA, payload.urlsB);
}

/**
 * @param {'merge'|'split'} action
 * @param {any} a
 * @param {any} b
 */
async function sendFeedback(action, a, b) {
  const tabsA = a?.tabs || [];
  const tabsB = b?.tabs || [];
  const tabIds = [...tabsA, ...tabsB].map((t) => t.tabId);
  return sendFeedbackPayload(
    action,
    tabIds,
    tabsA.map((t) => t.url),
    tabsB.map((t) => t.url),
  );
}

/**
 * @param {'merge'|'split'} action
 * @param {number[]} tabIds
 * @param {string[]} urlsA
 * @param {string[]} urlsB
 */
async function sendFeedbackPayload(action, tabIds, urlsA, urlsB) {
  actionResult.textContent = action === 'merge' ? t('merging') : t('splitting');
  try {
    const res = await send(MSG.TASK_FEEDBACK, {
      action,
      tabIds,
      urlsA,
      urlsB,
      allWindows: allWindowsView,
    });
    renderTaskView(res);
    actionResult.textContent = action === 'merge' ? t('mergedOk') : t('splitOk');
  } catch (err) {
    actionResult.textContent = err instanceof Error ? err.message : String(err);
  }
}

/** @param {number} done @param {number} total @param {string} [phase] */
function updateGroupProgress(done, total, phase) {
  if (!groupProgressEl) return;
  groupProgressEl.hidden = false;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  if (groupProgressFill) groupProgressFill.style.width = `${pct}%`;
  if (groupProgressText) {
    if (phase === 'quick') {
      groupProgressText.textContent =
        total > 0 ? t('quickRefine', { total }) : t('quickNoRefine');
    } else {
      groupProgressText.textContent = t('processed', { done, total });
    }
  }
}

function hideGroupProgress() {
  if (groupProgressEl) groupProgressEl.hidden = true;
  if (groupProgressFill) groupProgressFill.style.width = '0%';
}

async function onGroupNow() {
  btnGroupNow.disabled = true;
  hideGroupProgress();
  actionResult.textContent = allWindowsView ? t('groupingAll') : t('groupingCurrent');

  let lastBeat = Date.now();
  const onProgress = (message) => {
    if (message?.type !== MSG.GROUP_PROGRESS) return;
    lastBeat = Date.now();
    const done = Number(message.payload?.done) || 0;
    const total = Number(message.payload?.total) || 0;
    const phase = message.payload?.phase || 'refine';
    updateGroupProgress(done, total, phase);
    if (phase === 'quick') {
      actionResult.textContent =
        total > 0 ? t('quickRefineAll', { total }) : t('quickDone');
      void refreshTaskView();
    } else if (total > 0) {
      actionResult.textContent = t('processedEllipsis', { done, total });
    }
  };
  chrome.runtime.onMessage.addListener(onProgress);

  let aborted = false;
  const stall = setInterval(() => {
    if (Date.now() - lastBeat <= REFINE_STALL_MS) return;
    aborted = true;
    actionResult.textContent = t('refineStalled');
    chrome.runtime.onMessage.removeListener(onProgress);
    clearInterval(stall);
    btnGroupNow.disabled = false;
  }, 1000);

  let groupedOk = false;
  try {
    // No hard 20s cap on the whole job — progress + stall recover the button.
    const res = await chrome.runtime.sendMessage({
      type: MSG.GROUP_TABS,
      payload: { allWindows: allWindowsView },
    });
    if (aborted) return;
    if (!res?.ok) {
      actionResult.textContent = t('groupFail', { error: res?.error || t('unknownError') });
      return;
    }
    const src = res.sources
      ? Object.entries(res.sources)
          .map(([k, v]) => `${sourceLabel(k)}×${v}`)
          .join(document.documentElement.lang === 'en' ? ', ' : '，')
      : '';
    const refined = res.refined || 0;
    let summary = t('groupSummary', {
      grouped: res.grouped || 0,
      tasks: (res.clusters || []).length,
    });
    if (refined) summary += t('groupRefined', { refined });
    if ((res.labels || []).length) {
      const joiner = document.documentElement.lang === 'en' ? ', ' : '、';
      summary += t('groupLabels', { labels: res.labels.join(joiner) });
    }
    if (src) summary += t('groupSources', { src });
    actionResult.textContent = summary;
    if (refined > 0) updateGroupProgress(refined, refined, 'done');
    groupedOk = true;
  } catch (err) {
    if (!aborted) {
      actionResult.textContent = err instanceof Error ? err.message : String(err);
    }
  } finally {
    clearInterval(stall);
    chrome.runtime.onMessage.removeListener(onProgress);
    if (!aborted) btnGroupNow.disabled = false;
  }
  if (groupedOk) {
    try {
      await refreshTaskView();
    } catch {
      /* view refresh must not re-disable the button */
    }
  }
}

function sourceLabel(s) {
  return { nano: t('sourceNano'), custom: t('sourceCustom'), heuristic: t('sourceHeuristic') }[s] || s;
}
