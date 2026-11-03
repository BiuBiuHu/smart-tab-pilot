/**
 * Track recently closed tabs for quick search.
 * Primary: tabs.onRemoved + in-memory meta → chrome.storage.local (cap).
 * Secondary: merge chrome.sessions.getRecentlyClosed when permission allows.
 */
import { RECENT_CLOSED_CAP, RECENT_CLOSED_STORAGE_KEY } from '../shared/constants.js';
import { shouldSkipUrl } from '../shared/url-utils.js';

/** @typedef {{ id: string, title: string, url: string, favIconUrl?: string, closedAt: number, source: 'tracked'|'sessions' }} ClosedEntry */

/** @type {Map<number, { title: string, url: string, favIconUrl?: string }>} */
const tabMeta = new Map();

/** Tab ids closed by this extension (e.g. dedupe) — do not record. */
const suppressRecord = new Set();

/** @param {number} tabId */
export function suppressClosedRecord(tabId) {
  suppressRecord.add(tabId);
  // Auto-clear in case remove never fires
  setTimeout(() => suppressRecord.delete(tabId), 5000);
}

/** @param {chrome.tabs.Tab} tab */
export function rememberTabMeta(tab) {
  if (tab?.id == null) return;
  const url = tab.url || tab.pendingUrl || '';
  const prev = tabMeta.get(tab.id) || { title: '', url: '', favIconUrl: '' };
  tabMeta.set(tab.id, {
    title: tab.title || prev.title || '',
    url: url || prev.url || '',
    favIconUrl: tab.favIconUrl || prev.favIconUrl || '',
  });
}

export function forgetTabMeta(tabId) {
  tabMeta.delete(tabId);
}

/** Wire tab lifecycle listeners (call once from service worker). */
export function initRecentClosedTracking() {
  chrome.tabs.query({}).then((tabs) => {
    for (const t of tabs) rememberTabMeta(t);
  }).catch(() => {});

  chrome.tabs.onCreated.addListener((tab) => rememberTabMeta(tab));
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl || changeInfo.status) {
      rememberTabMeta(tab);
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void onTabRemoved(tabId);
  });
}

/** @param {number} tabId */
async function onTabRemoved(tabId) {
  const meta = tabMeta.get(tabId);
  tabMeta.delete(tabId);

  if (suppressRecord.has(tabId)) {
    suppressRecord.delete(tabId);
    return;
  }

  const url = meta?.url || '';
  if (!url || shouldSkipUrl(url)) return;

  /** @type {ClosedEntry} */
  const entry = {
    id: `tracked-${tabId}-${Date.now()}`,
    title: meta?.title || url,
    url,
    favIconUrl: meta?.favIconUrl || '',
    closedAt: Date.now(),
    source: 'tracked',
  };

  const list = await loadTrackedClosed();
  // De-dupe consecutive same URL
  const next = [entry, ...list.filter((e) => e.url !== entry.url)];
  await saveTrackedClosed(next.slice(0, RECENT_CLOSED_CAP));
}

/** @returns {Promise<ClosedEntry[]>} */
async function loadTrackedClosed() {
  const data = await chrome.storage.local.get(RECENT_CLOSED_STORAGE_KEY);
  const list = data[RECENT_CLOSED_STORAGE_KEY];
  return Array.isArray(list) ? list : [];
}

/** @param {ClosedEntry[]} list */
async function saveTrackedClosed(list) {
  await chrome.storage.local.set({ [RECENT_CLOSED_STORAGE_KEY]: list });
}

/**
 * Merge tracked + sessions closed tabs (sessions optional enhancement).
 * @returns {Promise<ClosedEntry[]>}
 */
export async function getRecentClosedMerged() {
  const tracked = await loadTrackedClosed();
  /** @type {ClosedEntry[]} */
  const fromSessions = [];

  try {
    if (chrome.sessions?.getRecentlyClosed) {
      const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
      for (const s of sessions) {
        if (s.tab?.url) {
          const url = s.tab.url;
          if (shouldSkipUrl(url)) continue;
          fromSessions.push({
            id: `session-tab-${s.tab.sessionId || url}-${s.lastModified || 0}`,
            title: s.tab.title || url,
            url,
            favIconUrl: s.tab.favIconUrl || '',
            closedAt: (s.lastModified || 0) * 1000,
            source: 'sessions',
          });
        } else if (s.window?.tabs) {
          for (const t of s.window.tabs) {
            if (!t.url || shouldSkipUrl(t.url)) continue;
            fromSessions.push({
              id: `session-win-${t.sessionId || t.url}-${s.lastModified || 0}`,
              title: t.title || t.url,
              url: t.url,
              favIconUrl: t.favIconUrl || '',
              closedAt: (s.lastModified || 0) * 1000,
              source: 'sessions',
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SmartTabPilot] sessions.getRecentlyClosed failed', err);
  }

  // Prefer tracked entries; fill with sessions URLs not already present.
  const seen = new Set(tracked.map((e) => e.url));
  const merged = [...tracked];
  for (const e of fromSessions) {
    if (seen.has(e.url)) continue;
    seen.add(e.url);
    merged.push(e);
  }

  merged.sort((a, b) => b.closedAt - a.closedAt);
  return merged.slice(0, RECENT_CLOSED_CAP);
}
