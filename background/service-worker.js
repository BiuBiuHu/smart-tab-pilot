/**
 * Smart Tab Pilot — MV3 service worker.
 * Exact-URL dedupe (cross-window) + 任务导航图 grouping + side panel messaging.
 */
import { MSG } from '../shared/constants.js';
import { getSettings, saveSettings } from '../shared/storage.js';
import { shouldSkipUrl } from '../shared/url-utils.js';
import { downloadNano, getNanoStatus } from './classifier.js';
import { handleExactDedupe } from './dedupe.js';
import {
  applyNavHint,
  applyPhysicalFromCurrentGraph,
  getTaskView,
  groupCurrentWindow,
  groupTabs,
  scheduleAutoGroup,
} from './grouping.js';
import { applyTaskFeedback, initNavMemory } from './nav-memory.js';
import { initRecentClosedTracking } from './recent-closed.js';
import { activateSearchResult, searchTabs } from './search.js';
import { initTabLineage } from './tab-lineage.js';
import { initTabSummaries } from './tab-summaries.js';

initTabLineage();
initTabSummaries();
initNavMemory();
initRecentClosedTracking();

/** Open Chrome side panel when the toolbar action (or _execute_action) is clicked. */
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn('[SmartTabPilot] sidePanel.setPanelBehavior failed', err));

chrome.runtime.onInstalled.addListener(() => {
  console.info('[SmartTabPilot] installed');
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn('[SmartTabPilot] sidePanel.setPanelBehavior failed', err));
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  return true;
});

/**
 * @param {{ type: string, payload?: Record<string, unknown> }} message
 * @param {chrome.runtime.MessageSender} sender
 */
async function handleMessage(message, sender) {
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
      const current = await chrome.windows.getLastFocused();
      if (current?.id == null) return { ok: false, error: 'no-window' };
      return await groupCurrentWindow(current.id);
    }

    case MSG.GROUP_TABS: {
      const allWindows = message.payload?.allWindows !== false;
      return await groupTabs({ allWindows });
    }

    case MSG.GET_TASK_VIEW: {
      const allWindows = message.payload?.allWindows !== false;
      return await getTaskView({ allWindows });
    }

    case MSG.TASK_FEEDBACK: {
      const payload = message.payload || {};
      const action = payload.action === 'split' ? 'split' : 'merge';
      const tabIds = Array.isArray(payload.tabIds) ? payload.tabIds : [];
      const urlsA = Array.isArray(payload.urlsA) ? payload.urlsA : [];
      const urlsB = Array.isArray(payload.urlsB) ? payload.urlsB : [];
      await applyTaskFeedback({ action, tabIds, urlsA, urlsB });
      const allWindows = payload.allWindows !== false;
      try {
        await applyPhysicalFromCurrentGraph({ allWindows });
      } catch (err) {
        console.warn('[SmartTabPilot] physical relayout after feedback failed', err);
      }
      return await getTaskView({ allWindows });
    }

    case MSG.TAB_NAV_HINT: {
      applyNavHint(sender?.tab?.id, message.payload || {});
      return { ok: true };
    }

    case MSG.SEARCH_TABS: {
      const query = typeof message.payload?.query === 'string' ? message.payload.query : '';
      const limit = typeof message.payload?.limit === 'number' ? message.payload.limit : 40;
      return await searchTabs(query, { limit });
    }

    case MSG.ACTIVATE_SEARCH_RESULT: {
      return await activateSearchResult(message.payload || {});
    }

    case MSG.GROUP_PROGRESS:
    case MSG.GROUP_REFINE_DONE:
      return { ok: true };

    default:
      return { ok: false, error: 'unknown-message' };
  }
}
