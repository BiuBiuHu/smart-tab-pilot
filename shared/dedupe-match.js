/**
 * Pure exact-URL candidate selection for dedupe (any window set).
 */
import { coalesceExactUrl, exactUrlIdentity, shouldSkipUrl } from './url-utils.js';

/**
 * Overlay observed full URLs (pendingUrl / location.href / lineage) so
 * Chrome-stripped fragments still participate in identity.
 * @param {{ id?: number, url?: string, pendingUrl?: string, windowId?: number }[]} tabs
 * @param {Map<number, string> | Record<number, string> | undefined} observedByTabId
 */
export function tabsWithExactUrls(tabs, observedByTabId) {
  const extra =
    observedByTabId instanceof Map
      ? observedByTabId
      : new Map(
          Object.entries(observedByTabId || {}).map(([k, v]) => [Number(k), v]),
        );
  return (tabs || []).map((t) => {
    const observed = (t.id != null ? extra.get(t.id) : '') || t.pendingUrl || '';
    return { ...t, url: coalesceExactUrl(t.url, observed) };
  });
}

/**
 * Find an existing tab with the same exact URL (path + query + hash).
 * Searches the provided tab list as-is — caller should query all windows
 * for cross-window jump. Prefers the oldest tab id (stable "already open" target).
 *
 * Hash and query are always part of identity (`ignoreHash` is ignored).
 *
 * @param {{ id?: number, url?: string, pendingUrl?: string, windowId?: number }[]} tabs
 * @param {number} tabId tab being navigated (excluded)
 * @param {string} url
 * @param {{ ignoreHash?: boolean, closingTabIds?: Iterable<number>, observedByTabId?: Map<number, string> | Record<number, string> }} [opts]
 * @returns {{ id: number, windowId?: number, url?: string } | null}
 */
export function findExactUrlMatch(tabs, tabId, url, opts = {}) {
  if (!url || shouldSkipUrl(url)) return null;
  const closing = new Set(opts.closingTabIds || []);
  const list = tabsWithExactUrls(tabs, opts.observedByTabId);
  const observedNav =
    opts.observedByTabId instanceof Map
      ? opts.observedByTabId.get(tabId)
      : opts.observedByTabId?.[tabId];
  const target = exactUrlIdentity(coalesceExactUrl(url, observedNav));
  if (!target) return null;

  const candidates = list.filter((t) => {
    if (t.id == null || t.id === tabId) return false;
    if (closing.has(t.id)) return false;
    if (!t.url || shouldSkipUrl(t.url)) return false;
    return exactUrlIdentity(t.url) === target;
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => (a.id || 0) - (b.id || 0));
  const match = candidates[0];
  return match.id != null ? match : null;
}
