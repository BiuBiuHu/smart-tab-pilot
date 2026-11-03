/**
 * Side panel UI — 任务导航图视图 + 中文开关；快速搜索默认关闭。
 */
import { withDeadline } from '../shared/async-timeout.js';
import { GROUP_RPC_TIMEOUT_MS, MSG } from '../shared/constants.js';

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
const fallbackHint = $('fallback-hint');
const searchInput = $('search-input');
const searchResults = $('search-results');
const searchEmpty = $('search-empty');

const AVAIL_LABELS = {
  available: { text: '可用', cls: 'badge-ok' },
  readily: { text: '可用', cls: 'badge-ok' },
  downloadable: { text: '可下载', cls: 'badge-warn' },
  downloading: { text: '下载中…', cls: 'badge-warn' },
  unavailable: { text: '不可用', cls: 'badge-bad' },
  missing: { text: 'API 缺失', cls: 'badge-bad' },
};

/** @type {{ kind: string, tabId?: number, windowId?: number, url?: string, title?: string }[]} */
let flatResults = [];
let activeIndex = -1;
let searchTimer = 0;
let quickSearchOn = false;
/** @type {{ id: string, label: string, tabs: any[], edges?: any }[]} */
let viewClusters = [];
let allWindowsView = true;

init();

async function init() {
  bind();
  await Promise.all([refreshNano(), loadSettings()]);
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
  btnGroupNow.addEventListener('click', onGroupNow);
  btnRefreshTasks.addEventListener('click', () => void refreshTaskView());
  scopeAll.addEventListener('change', onScopeChange);
  scopeCurrent.addEventListener('change', onScopeChange);
  taskClustersEl.addEventListener('click', onTaskClustersClick);

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

/** @param {boolean} enabled */
function applyQuickSearchVisibility(enabled) {
  quickSearchOn = !!enabled;
  if (searchCard) searchCard.hidden = !quickSearchOn;
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
    '后台响应超时，请重试',
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
    frag.appendChild(sectionLabel('打开的标签'));
    for (const hit of openHits) {
      flatResults.push(hit);
      frag.appendChild(resultButton(hit, flatResults.length - 1));
    }
  }
  if (closedHits.length) {
    frag.appendChild(sectionLabel('最近关闭'));
    for (const hit of closedHits) {
      flatResults.push(hit);
      frag.appendChild(resultButton(hit, flatResults.length - 1));
    }
  }

  searchResults.appendChild(frag);
  const empty = flatResults.length === 0;
  searchEmpty.hidden = !empty;
  searchEmpty.textContent = empty ? (searchInput.value.trim() ? '无匹配结果' : '暂无标签可显示') : '';
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
  tag.textContent = hit.kind === 'open' ? '打开' : '关闭';

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
    const meta = AVAIL_LABELS[avail] || AVAIL_LABELS.unavailable;
    nanoStatusEl.textContent = meta.text;
    nanoStatusEl.className = `badge ${meta.cls}`;
    nanoDetailEl.textContent = res?.detail || statusHint(avail);

    const needDownload = avail === 'downloadable' || avail === 'downloading';
    btnDownload.hidden = !needDownload;
    btnDownload.disabled = avail === 'downloading';

    updateFallbackHint(avail);
  } catch (err) {
    nanoStatusEl.textContent = '检测失败';
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
      return '将优先使用设备端 Gemini Nano 给任务簇打主题名（同网站不同主题仍会分任务）。';
    case 'downloadable':
      return '模型尚未下载。请点击下方按钮（需用户手势）触发下载。';
    case 'downloading':
      return '模型正在下载，请稍候再试。';
    case 'unavailable':
      return '当前环境无法使用 Nano。可配置下方自定义模型，或使用启发式主题名（任务簇仍以来源/时间为准）。';
    case 'missing':
      return '浏览器未暴露 LanguageModel。请使用支持 Prompt API 的 Chrome（实验旗标 / 足够新的版本）。';
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
    fallbackHint.textContent = '当前将使用自定义模型为任务簇命名（分组本身按任务导航图，非域名）。';
  } else {
    fallbackHint.textContent =
      '无可用模型时，任务簇以来源/时间/学习边聚合，主题名用启发式（不会用域名作为组名）。';
  }
}

async function onDownloadNano() {
  btnDownload.disabled = true;
  btnDownload.textContent = '正在请求下载…';
  actionResult.textContent = '';
  try {
    const res = await send(MSG.DOWNLOAD_NANO);
    if (!res?.ok) {
      actionResult.textContent = `下载失败：${res?.error || '未知错误'}`;
    } else {
      actionResult.textContent = '已触发 Nano 下载 / 会话创建。';
    }
  } catch (err) {
    actionResult.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    btnDownload.textContent = '下载 / 启用 Nano 模型';
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
  const availGuess = nanoStatusEl.textContent === '可用' ? 'available' : 'unavailable';
  updateFallbackHint(availGuess);
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
    actionResult.textContent = '自定义模型已保存。';
    await refreshNano();
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
  viewClusters = res?.clusters || [];
  taskClustersEl.innerHTML = '';
  if (!viewClusters.length) {
    taskClustersEl.hidden = true;
    taskEmpty.hidden = false;
    taskEmpty.textContent = allWindowsView
      ? '当前没有可展示的 http(s) 标签。打开几个页面后再刷新。'
      : '当前窗口没有可展示的标签。可切换到「全部窗口」。';
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

  const head = document.createElement('div');
  head.className = 'task-cluster-head';
  const title = document.createElement('div');
  title.className = 'task-cluster-title';
  const winNote = cluster.windowIds && cluster.windowIds.length > 1 ? ' · 跨窗口（逻辑）' : '';
  title.textContent = `${cluster.label || '未分类'} · ${cluster.tabs.length} 个标签${winNote}`;
  const meta = document.createElement('div');
  meta.className = 'task-cluster-meta';
  meta.textContent = edgeSummary(cluster.edges);
  head.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'task-cluster-actions';
  if (index > 0) {
    const mergeBtn = document.createElement('button');
    mergeBtn.type = 'button';
    mergeBtn.className = 'btn-text';
    mergeBtn.dataset.action = 'merge-prev';
    mergeBtn.dataset.index = String(index);
    mergeBtn.textContent = '与上一任务合并';
    actions.appendChild(mergeBtn);
  }
  if (cluster.tabs.length > 1) {
    const splitBtn = document.createElement('button');
    splitBtn.type = 'button';
    splitBtn.className = 'btn-text';
    splitBtn.dataset.action = 'split';
    splitBtn.dataset.index = String(index);
    splitBtn.textContent = '拆成独立任务';
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

  const badge = document.createElement('span');
  badge.className = 'win-badge';
  badge.textContent = tab.windowBadge || '窗口';

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
  if (!edges) return '任务导航图';
  const parts = [];
  if (edges.opener) parts.push(`来源×${edges.opener}`);
  if (edges.referrer) parts.push(`引用×${edges.referrer}`);
  if (edges.time) parts.push(`时间×${edges.time}`);
  if (edges.learned) parts.push(`学习×${edges.learned}`);
  if (edges.feedback) parts.push(`反馈×${edges.feedback}`);
  return parts.length ? parts.join(' · ') : '独立任务';
}

/** @param {MouseEvent} ev */
function onTaskClustersClick(ev) {
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
    void sendFeedback('merge', viewClusters[index - 1], viewClusters[index]);
  } else if (action === 'split') {
    void sendFeedback('split', viewClusters[index], null);
  }
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
  actionResult.textContent = action === 'merge' ? '正在合并任务…' : '正在拆分任务…';
  try {
    const res = await send(MSG.TASK_FEEDBACK, {
      action,
      tabIds,
      urlsA: tabsA.map((t) => t.url),
      urlsB: tabsB.map((t) => t.url),
      allWindows: allWindowsView,
    });
    renderTaskView(res);
    actionResult.textContent =
      action === 'merge'
        ? '已合并：会加强这两类导航的学习权重。'
        : '已拆分：本次会话不再把这些标签并成同一任务。';
  } catch (err) {
    actionResult.textContent = err instanceof Error ? err.message : String(err);
  }
}

async function onGroupNow() {
  btnGroupNow.disabled = true;
  actionResult.textContent = allWindowsView
    ? '正在按任务导航图整理全部窗口…'
    : '正在按任务导航图整理当前窗口…';

  const onProgress = (message) => {
    if (message?.type !== MSG.GROUP_PROGRESS) return;
    const done = Number(message.payload?.done) || 0;
    const total = Number(message.payload?.total) || 0;
    if (total > 0) actionResult.textContent = `已处理 ${done}/${total}…`;
  };
  chrome.runtime.onMessage.addListener(onProgress);

  let groupedOk = false;
  try {
    const res = await send(MSG.GROUP_TABS, { allWindows: allWindowsView }, GROUP_RPC_TIMEOUT_MS);
    if (!res?.ok) {
      actionResult.textContent = `整理失败：${res?.error || '未知错误'}`;
      return;
    }
    const src = res.sources
      ? Object.entries(res.sources)
          .map(([k, v]) => `${sourceZh(k)}×${v}`)
          .join('，')
      : '';
    actionResult.textContent = `已整理 ${res.grouped || 0} 个标签 / ${ (res.clusters || []).length } 个任务（${(res.labels || []).join('、') || '无'}）${src ? '；主题来源：' + src : ''}`;
    groupedOk = true;
  } catch (err) {
    actionResult.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    chrome.runtime.onMessage.removeListener(onProgress);
    btnGroupNow.disabled = false;
  }
  if (groupedOk) {
    try {
      await refreshTaskView();
    } catch {
      /* view refresh must not re-disable the button */
    }
  }
}

function sourceZh(s) {
  return { nano: 'Nano', custom: '自定义', heuristic: '启发式' }[s] || s;
}
