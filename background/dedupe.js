/**
 * Exact-URL duplicate jump: activate existing tab (any window), close the new one.
 * Prefer the older existing tab; never remove the match first.
 */
import { findExactUrlMatch } from '../shared/dedupe-match.js';
import { getSettings } from '../shared/storage.js';
import { shouldSkipUrl } from '../shared/url-utils.js';
import { suppressClosedRecord } from './recent-closed.js';

/** Tabs we just closed (or are closing) as duplicates — avoid re-entry / matching them. */
const closingTabIds = new Set();

/**
 * On navigation commit / complete, if another tab (any window) already
 * has the same URL, focus that window+tab and close this one.
 * @param {number} tabId
 * @param {string} url
 * @param {number | undefined} windowId unused (kept for call-site compatibility)
 * @returns {Promise<boolean>} true if this tab was closed as a duplicate
 */
export async function handleExactDedupe(tabId, url, windowId) {
  void windowId;
  if (closingTabIds.has(tabId)) return false;
  if (!url || shouldSkipUrl(url)) return false;

  const settings = await getSettings();
  if (!settings.exactDedupeEnabled) return false;

  let tabs;
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return false;
  }

  const match = findExactUrlMatch(tabs, tabId, url, {
    ignoreHash: settings.ignoreHash === true,
    closingTabIds,
  });
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
