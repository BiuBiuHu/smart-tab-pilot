/**
 * Pure exact-URL candidate selection for dedupe (any window set).
 */
import { normalizeUrl, shouldSkipUrl } from './url-utils.js';

/**
 * Find an existing tab with the same normalized URL. Searches the provided
 * tab list as-is — caller should query all windows for cross-window jump.
 * Prefers the oldest tab id (stable "already open" target).
 *
 * @param {{ id?: number, url?: string, windowId?: number }[]} tabs
 * @param {number} tabId tab being navigated (excluded)
 * @param {string} url
 * @param {{ ignoreHash?: boolean, closingTabIds?: Iterable<number> }} [opts]
 * @returns {{ id: number, windowId?: number, url?: string } | null}
 */
export function findExactUrlMatch(tabs, tabId, url, opts = {}) {
  if (!url || shouldSkipUrl(url)) return null;
  const ignoreHash = opts.ignoreHash === true;
  const closing = new Set(opts.closingTabIds || []);
  const target = normalizeUrl(url, { ignoreHash });
  if (!target) return null;

  const candidates = (tabs || []).filter((t) => {
    if (t.id == null || t.id === tabId) return false;
    if (closing.has(t.id)) return false;
    if (!t.url || shouldSkipUrl(t.url)) return false;
    return normalizeUrl(t.url, { ignoreHash }) === target;
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => (a.id || 0) - (b.id || 0));
  const match = candidates[0];
  return match.id != null ? match : null;
}
