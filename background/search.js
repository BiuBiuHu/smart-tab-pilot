/**
 * Quick search: open tabs by title/URL + recently closed entries.
 */
import { shouldSkipUrl } from '../shared/url-utils.js';
import { getRecentClosedMerged } from './recent-closed.js';

/**
 * @typedef {{ kind: 'open'|'closed', id: string, tabId?: number, windowId?: number, title: string, url: string, favIconUrl?: string, closedAt?: number, source?: string }} SearchHit
 */

/**
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ ok: true, open: SearchHit[], closed: SearchHit[] }>}
 */
export async function searchTabs(query, opts = {}) {
  const limit = opts.limit ?? 40;
  const q = (query || '').trim().toLowerCase();

  const openTabs = await chrome.tabs.query({});
  /** @type {SearchHit[]} */
  let openHits = openTabs
    .filter((t) => t.id != null && t.url && !shouldSkipUrl(t.url))
    .map((t) => ({
      kind: /** @type {'open'} */ ('open'),
      id: `open-${t.id}`,
      tabId: t.id,
      windowId: t.windowId,
      title: t.title || t.url || '',
      url: t.url || '',
      favIconUrl: t.favIconUrl || '',
    }));

  const closedRaw = await getRecentClosedMerged();
  /** @type {SearchHit[]} */
  let closedHits = closedRaw.map((e) => ({
    kind: /** @type {'closed'} */ ('closed'),
    id: e.id,
    title: e.title,
    url: e.url,
    favIconUrl: e.favIconUrl || '',
    closedAt: e.closedAt,
    source: e.source,
  }));

  // Do not show a "closed" hit if that URL is still open
  const openUrls = new Set(openHits.map((h) => h.url));
  closedHits = closedHits.filter((h) => !openUrls.has(h.url));

  if (q) {
    openHits = openHits.filter((h) => matches(h, q));
    closedHits = closedHits.filter((h) => matches(h, q));
    openHits.sort((a, b) => score(b, q) - score(a, q));
    closedHits.sort((a, b) => score(b, q) - score(a, q));
  } else {
    // Empty query: show current-window-ish open tabs first (active window), then recent closed
    openHits.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh'));
  }

  const openLimit = Math.min(limit, openHits.length);
  const closedLimit = Math.min(limit, closedHits.length);

  return {
    ok: true,
    open: openHits.slice(0, openLimit),
    closed: closedHits.slice(0, closedLimit),
  };
}

/**
 * Activate an open tab or reopen a closed URL.
 * @param {{ kind: 'open'|'closed', tabId?: number, windowId?: number, url?: string }} target
 */
export async function activateSearchResult(target) {
  if (target.kind === 'open' && target.tabId != null) {
    await chrome.tabs.update(target.tabId, { active: true });
    if (target.windowId != null) {
      await chrome.windows.update(target.windowId, { focused: true });
    }
    return { ok: true, action: 'activated' };
  }

  if (target.kind === 'closed' && target.url) {
    const tab = await chrome.tabs.create({ url: target.url, active: true });
    return { ok: true, action: 'reopened', tabId: tab.id };
  }

  return { ok: false, error: 'invalid-target' };
}

/** @param {SearchHit} hit @param {string} q */
function matches(hit, q) {
  return (hit.title || '').toLowerCase().includes(q) || (hit.url || '').toLowerCase().includes(q);
}

/** Simple rank: title prefix > title includes > url includes */
function score(hit, q) {
  const title = (hit.title || '').toLowerCase();
  const url = (hit.url || '').toLowerCase();
  let s = 0;
  if (title.startsWith(q)) s += 100;
  if (title.includes(q)) s += 40;
  if (url.includes(q)) s += 20;
  return s;
}
