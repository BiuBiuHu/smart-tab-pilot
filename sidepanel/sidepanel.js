/**
 * Side panel UI — Chinese strings; MVP toggles + optional quick search (default off).
 */
import { MSG } from '../shared/constants.js';

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

init();

async function init() {
  bind();
  await Promise.all([refreshNano(), loadSettings()]);
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

async function send(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
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
      return '将优先使用设备端 Gemini Nano，按页面正文主题分类（同网站不同主题会进不同组）。';
    case 'downloadable':
      return '模型尚未下载。请点击下方按钮（需用户手势）触发下载。';
    case 'downloading':
      return '模型正在下载，请稍候再试。';
    case 'unavailable':
      return '当前环境无法使用 Nano。可配置下方自定义模型，或使用正文/标题启发式（不会按域名合并）。';
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
    fallbackHint.textContent = '当前将使用自定义 OpenAI 兼容接口按主题分类（非域名）。';
  } else {
    fallbackHint.textContent =
      '无可用模型时，将仅用标题/正文关键词启发式分组（不会用域名作为组名），并在此提示。';
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

async function onGroupNow() {
  btnGroupNow.disabled = true;
  actionResult.textContent = '正在按正文主题分组…';
  try {
    const res = await send(MSG.GROUP_CURRENT_WINDOW);
    if (!res?.ok) {
      actionResult.textContent = `分组失败：${res?.error || '未知错误'}`;
      return;
    }
    const src = res.sources
      ? Object.entries(res.sources)
          .map(([k, v]) => `${sourceZh(k)}×${v}`)
          .join('，')
      : '';
    actionResult.textContent = `已分组 ${res.grouped || 0} 个标签页（${(res.labels || []).join('、') || '无'}）${src ? '；来源：' + src : ''}`;
  } catch (err) {
    actionResult.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    btnGroupNow.disabled = false;
  }
}

function sourceZh(s) {
  return { nano: 'Nano', custom: '自定义', heuristic: '启发式' }[s] || s;
}
