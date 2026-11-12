/**
 * Live tab-tree lineage for 任务导航图.
 * Remembers opener / pendingUrl / referrer / createdAt while the tab is alive.
 * Survives service-worker restarts via chrome.storage.session.
 */
import { SESSION_LINEAGE_KEY } from '../shared/constants.js';
import { coalesceExactUrl, isEphemeralNewTabUrl } from '../shared/url-utils.js';

/**
 * @typedef {{
 *   openerTabId: number | null,
 *   openerUrl: string,
 *   createdAt: number,
 *   windowId: number,
 *   url: string,
 *   pendingUrl: string,
 *   referrerUrl: string,
 *   birthUrl: string,
 *   openerFromNavigation: boolean,
 * }} LineageRecord
 */

/** @type {Map<number, LineageRecord>} */
const lineage = new Map();
let persistTimer = 0;
let hydrated = false;

/** @returns {Promise<void>} */
export async function hydrateLineage() {
  if (hydrated) return;
  hydrated = true;
  try {
    const bag = await chrome.storage.session.get(SESSION_LINEAGE_KEY);
    const raw = bag[SESSION_LINEAGE_KEY];
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        const id = Number(k);
        if (!Number.isFinite(id) || !v || typeof v !== 'object') continue;
        lineage.set(id, normalizeRecord(/** @type {Partial<LineageRecord>} */ (v)));
      }
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
  const obj = /** @type {Record<string, LineageRecord>} */ ({});
  for (const [id, rec] of lineage) obj[String(id)] = rec;
  try {
    await chrome.storage.session.set({ [SESSION_LINEAGE_KEY]: obj });
  } catch {
    /* ignore */
  }
}

/** @param {Partial<LineageRecord>} raw @returns {LineageRecord} */
function normalizeRecord(raw) {
  return {
    openerTabId: raw.openerTabId ?? null,
    openerUrl: raw.openerUrl || '',
    createdAt: raw.createdAt || 0,
    windowId: raw.windowId || 0,
    url: raw.url || '',
    pendingUrl: raw.pendingUrl || '',
    referrerUrl: raw.referrerUrl || '',
    birthUrl: raw.birthUrl || '',
    openerFromNavigation: raw.openerFromNavigation === true,
  };
}

/**
 * @param {chrome.tabs.Tab} tab
 * @param {{ created?: boolean }} [opts]
 */
export function rememberTab(tab, opts = {}) {
  if (tab?.id == null) return;
  const prev = lineage.get(tab.id);
  const openerTabId =
    tab.openerTabId != null ? tab.openerTabId : prev?.openerTabId ?? null;
  let openerUrl = prev?.openerUrl || '';
  if (openerTabId != null && !openerUrl) {
    openerUrl = lineage.get(openerTabId)?.url || '';
  }
  const pendingUrl = tab.pendingUrl || prev?.pendingUrl || '';
  const url =
    coalesceExactUrl(tab.url || '', pendingUrl || prev?.url || '') ||
    tab.url ||
    pendingUrl ||
    prev?.url ||
    '';
  const dest = (tab.pendingUrl || tab.url || '').trim();
  let birthUrl = prev?.birthUrl || '';
  let openerFromNavigation = prev?.openerFromNavigation === true;
  if (opts.created) {
    birthUrl = dest;
    openerFromNavigation = Boolean(dest) && !isEphemeralNewTabUrl(dest);
  }
  const rec = normalizeRecord({
    openerTabId,
    openerUrl,
    createdAt: opts.created ? Date.now() : prev?.createdAt || 0,
    windowId: tab.windowId ?? prev?.windowId ?? 0,
    url: url || pendingUrl,
    pendingUrl,
    referrerUrl: prev?.referrerUrl || '',
    birthUrl,
    openerFromNavigation,
  });
  lineage.set(tab.id, rec);
  persistSoon();
}

/**
 * @param {number} tabId
 * @param {Partial<LineageRecord>} patch
 */
export function patchLineage(tabId, patch) {
  const prev = lineage.get(tabId) || normalizeRecord({});
  lineage.set(tabId, normalizeRecord({ ...prev, ...patch }));
  persistSoon();
}

/** @param {number} tabId */
export function getLineage(tabId) {
  return lineage.get(tabId) || null;
}

/** @returns {Map<number, LineageRecord>} */
export function getLineageMap() {
  return lineage;
}

/** @param {number} tabId */
export function forgetLineage(tabId) {
  const rec = lineage.get(tabId) || null;
  lineage.delete(tabId);
  persistSoon();
  return rec;
}

/**
 * Attach lineage fields onto chrome.tabs.Tab-like objects.
 * createdAt is only set when we observed onCreated (0 means unknown — no time edge).
 * @template {{ id?: number, openerTabId?: number, windowId?: number, url?: string, pendingUrl?: string, title?: string }} T
 * @param {T[]} tabs
 */
export function attachLineage(tabs) {
  return (tabs || []).map((t) => {
    const rec = t.id != null ? lineage.get(t.id) : null;
    return {
      id: t.id,
      windowId: t.windowId,
      title: t.title,
      url: coalesceExactUrl(t.url, rec?.url || t.pendingUrl || rec?.pendingUrl) || t.url || rec?.url || t.pendingUrl || rec?.pendingUrl || '',
      openerTabId: t.openerTabId != null ? t.openerTabId : rec?.openerTabId ?? null,
      createdAt: rec?.createdAt || undefined,
      referrerUrl: rec?.referrerUrl || '',
      birthUrl: rec?.birthUrl || '',
      openerFromNavigation: rec?.openerFromNavigation === true,
    };
  });
}

/** Wire listeners — call once from the service worker. */
export function initTabLineage() {
  void hydrateLineage();

  chrome.tabs.onCreated.addListener((tab) => {
    rememberTab(tab, { created: true });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.title || tab?.url || tab?.pendingUrl) {
      rememberTab(tab || { id: tabId, url: changeInfo.url });
    }
  });

  chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    patchLineage(tabId, { windowId: attachInfo.newWindowId });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    // forget is invoked by nav-memory after recording priors
    void tabId;
  });

  const rememberCommittedUrl = (details) => {
    if (!details || details.frameId !== 0 || details.tabId == null) return;
    if (!details.url) return;
    patchLineage(details.tabId, { url: details.url });
  };
  try {
    chrome.webNavigation?.onCommitted?.addListener(rememberCommittedUrl);
    chrome.webNavigation?.onReferenceFragmentUpdated?.addListener(rememberCommittedUrl);
  } catch {
    /* permission may be missing in older unpacked builds */
  }
}
