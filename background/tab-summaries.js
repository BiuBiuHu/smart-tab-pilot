/**
 * Persist short tab summaries (never full page bodies).
 * Refresh on navigate; drop on close; cap store size.
 */
import { TAB_SUMMARY_STORAGE_KEY, TAB_SUMMARY_STORE_CAP } from '../shared/constants.js';
import {
  buildTabSummary,
  capSummaryStore,
  summaryIsStale,
} from '../shared/tab-summary.js';

/** @typedef {import('../shared/tab-summary.js').TabSummary} TabSummary */

/** @type {Map<number, TabSummary>} */
const summaries = new Map();
let persistTimer = 0;
let hydrated = false;

/** @returns {Promise<void>} */
export async function hydrateTabSummaries() {
  if (hydrated) return;
  hydrated = true;
  try {
    const bag = await chrome.storage.session.get(TAB_SUMMARY_STORAGE_KEY);
    const raw = bag[TAB_SUMMARY_STORAGE_KEY];
    if (!raw || typeof raw !== 'object') return;
    for (const [k, v] of Object.entries(raw)) {
      const id = Number(k);
      if (!Number.isFinite(id) || !v || typeof v !== 'object') continue;
      summaries.set(id, normalize(v));
    }
  } catch {
    /* session storage may be unavailable in tests */
  }
}

function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void persistNow();
  }, 80);
}

async function persistNow() {
  const obj = /** @type {Record<string, TabSummary>} */ ({});
  for (const [id, rec] of summaries) obj[String(id)] = rec;
  const capped = capSummaryStore(obj, TAB_SUMMARY_STORE_CAP);
  if (Object.keys(capped).length < summaries.size) {
    summaries.clear();
    for (const [k, v] of Object.entries(capped)) summaries.set(Number(k), v);
  }
  try {
    await chrome.storage.session.set({ [TAB_SUMMARY_STORAGE_KEY]: capped });
  } catch {
    /* ignore */
  }
}

/** @param {Partial<TabSummary>} raw @returns {TabSummary} */
function normalize(raw) {
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    url: typeof raw.url === 'string' ? raw.url : '',
    pathKey: typeof raw.pathKey === 'string' ? raw.pathKey : '',
    slugs: Array.isArray(raw.slugs) ? raw.slugs.filter((s) => typeof s === 'string') : [],
    excerpt: typeof raw.excerpt === 'string' ? raw.excerpt : '',
    extractedAt: typeof raw.extractedAt === 'number' ? raw.extractedAt : 0,
  };
}

/**
 * @param {number} tabId
 * @param {{ title?: string, url?: string, text?: string }} page
 */
export function upsertTabSummary(tabId, page) {
  if (tabId == null) return null;
  const next = buildTabSummary({
    title: page.title,
    url: page.url,
    text: page.text,
    extractedAt: Date.now(),
  });
  const prev = summaries.get(tabId);
  if (prev && !summaryIsStale(prev, next.url) && prev.excerpt && !next.excerpt) {
    next.excerpt = prev.excerpt;
  }
  summaries.set(tabId, next);
  persistSoon();
  return next;
}

/** @param {number} tabId */
export function getTabSummary(tabId) {
  return summaries.get(tabId) || null;
}

/** @returns {Map<number, TabSummary>} */
export function getTabSummaryMap() {
  return summaries;
}

/** @param {number} tabId */
export function forgetTabSummary(tabId) {
  summaries.delete(tabId);
  persistSoon();
}

/**
 * Drop excerpt when the tab navigates to a different URL.
 * @param {number} tabId
 * @param {string | undefined} url
 * @param {string | undefined} title
 */
export function refreshSummaryOnNavigate(tabId, url, title) {
  if (tabId == null || !url) return;
  const prev = summaries.get(tabId);
  if (prev && !summaryIsStale(prev, url) && title && prev.title === title) return;
  upsertTabSummary(tabId, { title: title || prev?.title || '', url, text: '' });
}

export function initTabSummaries() {
  void hydrateTabSummaries();

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      refreshSummaryOnNavigate(tabId, changeInfo.url, tab?.title || '');
    } else if (changeInfo.title && tab?.url) {
      const prev = summaries.get(tabId);
      if (prev && !summaryIsStale(prev, tab.url)) {
        summaries.set(tabId, { ...prev, title: changeInfo.title, extractedAt: Date.now() });
        persistSoon();
      } else {
        refreshSummaryOnNavigate(tabId, tab.url, changeInfo.title);
      }
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    forgetTabSummary(tabId);
  });
}
