/**
 * Smart Tab Pilot — MV3 service worker.
 * Exact-URL dedupe + semantic grouping + quick search + popup messaging.
 */
import { MSG } from '../shared/constants.js';
import { getSettings, saveSettings } from '../shared/storage.js';
import { shouldSkipUrl } from '../shared/url-utils.js';
import { downloadNano, getNanoStatus } from './classifier.js';
import { handleExactDedupe } from './dedupe.js';
import { groupCurrentWindow, scheduleAutoGroup } from './grouping.js';
import { initRecentClosedTracking } from './recent-closed.js';
import { activateSearchResult, searchTabs } from './search.js';

initRecentClosedTracking();

chrome.runtime.onInstalled.addListener(() => {
  console.info('[SmartTabPilot] installed');
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const closed = await safeDedupe(tabId, changeInfo.url, tab.windowId);
    if (closed) return;
  }

  if (changeInfo.status === 'complete' && tab.url) {
    const closed = await safeDedupe(tabId, tab.url, tab.windowId);
    if (closed) return;
    if (!shouldSkipUrl(tab.url)) {
      scheduleAutoGroup(tabId);
    }
  }
});

/**
 * @param {number} tabId
 * @param {string} url
 * @param {number} [windowId]
 */
async function safeDedupe(tabId, url, windowId) {
  try {
    let wid = windowId;
    if (wid == null) {
      try {
        wid = (await chrome.tabs.get(tabId)).windowId;
      } catch {
        return false;
      }
    }
    return await handleExactDedupe(tabId, url, wid);
  } catch (err) {
    console.warn('[SmartTabPilot] dedupe hook error', err);
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  return true;
});

/** @param {{ type: string, payload?: Record<string, unknown> }} message */
async function handleMessage(message) {
  switch (message?.type) {
    case MSG.GET_NANO_STATUS:
      return { ok: true, ...(await getNanoStatus()) };

    case MSG.DOWNLOAD_NANO:
      return await downloadNano();

    case MSG.GET_SETTINGS:
      return { ok: true, settings: await getSettings() };

    case MSG.SAVE_SETTINGS: {
      await saveSettings(message.payload || {});
      return { ok: true, settings: await getSettings() };
    }

    case MSG.GROUP_CURRENT_WINDOW: {
      const current = await chrome.windows.getCurrent();
      if (current?.id == null) return { ok: false, error: 'no-window' };
      return await groupCurrentWindow(current.id);
    }

    case MSG.SEARCH_TABS: {
      const query = typeof message.payload?.query === 'string' ? message.payload.query : '';
      const limit = typeof message.payload?.limit === 'number' ? message.payload.limit : 40;
      return await searchTabs(query, { limit });
    }

    case MSG.ACTIVATE_SEARCH_RESULT: {
      return await activateSearchResult(message.payload || {});
    }

    default:
      return { ok: false, error: 'unknown-message' };
  }
}
