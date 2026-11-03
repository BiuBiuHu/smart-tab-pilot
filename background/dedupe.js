/**
 * Exact-URL duplicate jump: activate existing tab, close the new one.
 */
import { getSettings } from '../shared/storage.js';
import { normalizeUrl, shouldSkipUrl } from '../shared/url-utils.js';
import { suppressClosedRecord } from './recent-closed.js';

/** Tabs we just closed as duplicates — avoid re-entry. */
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
  if (shouldSkipUrl(url)) return false;

  const settings = await getSettings();
  if (!settings.exactDedupeEnabled) return false;

  const ignoreHash = settings.ignoreHash === true;
  const target = normalizeUrl(url, { ignoreHash });

  let tabs;
  try {
    tabs = await chrome.tabs.query(windowId != null ? { windowId } : {});
  } catch {
    return false;
  }

  const match = tabs.find((t) => {
    if (t.id == null || t.id === tabId) return false;
    if (!t.url || shouldSkipUrl(t.url)) return false;
    return normalizeUrl(t.url, { ignoreHash }) === target;
  });

  if (!match || match.id == null) return false;

  closingTabIds.add(tabId);
  suppressClosedRecord(tabId);
  try {
    await chrome.tabs.update(match.id, { active: true });
    if (match.windowId != null) {
      await chrome.windows.update(match.windowId, { focused: true });
    }
    await chrome.tabs.remove(tabId);
    console.info('[SmartTabPilot] dedupe → tab', match.id, 'closed', tabId);
    return true;
  } catch (err) {
    console.warn('[SmartTabPilot] dedupe failed', err);
    return false;
  } finally {
    closingTabIds.delete(tabId);
  }
}
