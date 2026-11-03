/**
 * Exact-URL duplicate jump: activate existing tab, close the new one.
 * Same-window only. Prefer the older existing tab; never remove the match first.
 */
import { getSettings } from '../shared/storage.js';
import { normalizeUrl, shouldSkipUrl } from '../shared/url-utils.js';
import { suppressClosedRecord } from './recent-closed.js';

/** Tabs we just closed (or are closing) as duplicates — avoid re-entry / matching them. */
const closingTabIds = new Set();

/**
 * On navigation commit / complete, if another tab in the same window already
 * has the same URL, focus that tab and close this one.
 * @param {number} tabId
 * @param {string} url
 * @param {number | undefined} windowId
 * @returns {Promise<boolean>} true if this tab was closed as a duplicate
 */
export async function handleExactDedupe(tabId, url, windowId) {
  if (closingTabIds.has(tabId)) return false;
  if (!url || shouldSkipUrl(url)) return false;
  // Require window scope — never cross-window dedupe (MVP).
  if (windowId == null) return false;

  const settings = await getSettings();
  if (!settings.exactDedupeEnabled) return false;

  const ignoreHash = settings.ignoreHash === true;
  const target = normalizeUrl(url, { ignoreHash });
  if (!target) return false;

  let tabs;
  try {
    tabs = await chrome.tabs.query({ windowId });
  } catch {
    return false;
  }

  const candidates = tabs.filter((t) => {
    if (t.id == null || t.id === tabId) return false;
    if (closingTabIds.has(t.id)) return false;
    if (!t.url || shouldSkipUrl(t.url)) return false;
    return normalizeUrl(t.url, { ignoreHash }) === target;
  });

  if (!candidates.length) return false;

  // Prefer the oldest / left-most existing tab (stable "already open" target).
  candidates.sort((a, b) => {
    const ia = typeof a.index === 'number' ? a.index : 0;
    const ib = typeof b.index === 'number' ? b.index : 0;
    if (ia !== ib) return ia - ib;
    return (a.id || 0) - (b.id || 0);
  });
  const match = candidates[0];
  if (!match || match.id == null) return false;

  closingTabIds.add(tabId);
  suppressClosedRecord(tabId);
  try {
    // Activate existing first; only then remove the new duplicate (REQ-001 safety).
    await chrome.tabs.update(match.id, { active: true });
    if (match.windowId != null) {
      await chrome.windows.update(match.windowId, { focused: true });
    }
    await chrome.tabs.remove(tabId);
    console.info('[SmartTabPilot] dedupe → tab', match.id, 'closed', tabId);
    return true;
  } catch (err) {
    console.warn('[SmartTabPilot] dedupe failed', err);
    // Prefer keeping both tabs over killing the wrong one.
    return false;
  } finally {
    closingTabIds.delete(tabId);
  }
}

/** @returns {Set<number>} */
export function getClosingTabIdsForTests() {
  return closingTabIds;
}
