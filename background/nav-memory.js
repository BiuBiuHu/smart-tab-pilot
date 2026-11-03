/**
 * Persist 任务导航图 priors + session feedback.
 * On tab close: write a durable weak prior for opener/time co-occurrence.
 */
import {
  EDGE_WEIGHT,
  NAV_PRIORS_STORAGE_KEY,
  SESSION_FEEDBACK_KEY,
  TIME_ADJACENCY_MS,
} from '../shared/constants.js';
import {
  applyFeedbackAcrossUrlSets,
  bumpPrior,
  emptyPriorStore,
  normalizePriorStore,
} from '../shared/nav-priors.js';
import { recordSessionFeedback } from '../shared/task-graph.js';
import { forgetLineage, getLineage, getLineageMap, hydrateLineage } from './tab-lineage.js';

/** @typedef {import('../shared/nav-priors.js').PriorStore} PriorStore */

/** @returns {Promise<PriorStore>} */
export async function loadPriors() {
  try {
    const bag = await chrome.storage.local.get(NAV_PRIORS_STORAGE_KEY);
    return normalizePriorStore(bag[NAV_PRIORS_STORAGE_KEY]);
  } catch {
    return emptyPriorStore();
  }
}

/** @param {PriorStore} store */
export async function savePriors(store) {
  try {
    await chrome.storage.local.set({ [NAV_PRIORS_STORAGE_KEY]: store });
  } catch (err) {
    console.warn('[SmartTabPilot] save priors failed', err);
  }
}

/** @returns {Promise<{ merges: [number, number][], splits: [number, number][] }>} */
export async function loadSessionFeedback() {
  try {
    const bag = await chrome.storage.session.get(SESSION_FEEDBACK_KEY);
    const raw = bag[SESSION_FEEDBACK_KEY];
    if (!raw || typeof raw !== 'object') return { merges: [], splits: [] };
    return {
      merges: Array.isArray(raw.merges) ? raw.merges : [],
      splits: Array.isArray(raw.splits) ? raw.splits : [],
    };
  } catch {
    return { merges: [], splits: [] };
  }
}

/** @param {{ merges: [number, number][], splits: [number, number][] }} state */
export async function saveSessionFeedback(state) {
  try {
    await chrome.storage.session.set({ [SESSION_FEEDBACK_KEY]: state });
  } catch {
    /* ignore */
  }
}

/**
 * Record opener + time-adjacent URL pairs when a tab closes.
 * @param {number} tabId
 */
export async function recordClosePriors(tabId) {
  await hydrateLineage();
  const rec = forgetLineage(tabId);
  if (!rec || !rec.url) return;

  let store = await loadPriors();
  const now = Date.now();

  const openerUrl = rec.openerUrl || (rec.openerTabId != null ? getLineage(rec.openerTabId)?.url : '');
  if (openerUrl) {
    store = bumpPrior(store, openerUrl, rec.url, {
      source: 'opener',
      delta: EDGE_WEIGHT.LEARNED_OPENER_DELTA,
      now,
    });
  }

  for (const [otherId, other] of getLineageMap()) {
    if (otherId === tabId) continue;
    if (!other.url || other.windowId !== rec.windowId) continue;
    if (!rec.createdAt || !other.createdAt) continue;
    if (Math.abs(rec.createdAt - other.createdAt) > TIME_ADJACENCY_MS) continue;
    store = bumpPrior(store, rec.url, other.url, {
      source: 'time',
      delta: EDGE_WEIGHT.LEARNED_TIME_DELTA,
      now,
    });
  }

  await savePriors(store);
}

/**
 * Manual merge/split: adjust durable weights + session overrides.
 * `clusterUrls` is two groups (merge A↔B) or one group (split all pairs).
 * @param {{
 *   action: 'merge'|'split',
 *   tabIds?: number[],
 *   urlsA?: string[],
 *   urlsB?: string[],
 * }} payload
 */
export async function applyTaskFeedback(payload) {
  const action = payload.action === 'split' ? 'split' : 'merge';
  const tabIds = payload.tabIds || [];
  const session = await loadSessionFeedback();
  const nextSession = recordSessionFeedback(session, action, tabIds);
  await saveSessionFeedback(nextSession);

  const urlsA = payload.urlsA || [];
  const urlsB = payload.urlsB || [];
  if (urlsA.length && (urlsB.length || action === 'split')) {
    let store = await loadPriors();
    if (action === 'merge' && urlsB.length) {
      store = applyFeedbackAcrossUrlSets(store, urlsA, urlsB, 'merge');
    } else if (action === 'split') {
      const all = urlsB.length ? [...urlsA, ...urlsB] : urlsA;
      store = applyFeedbackAcrossUrlSets(store, all, all, 'split');
    }
    await savePriors(store);
  }

  return { ok: true, action, session: nextSession };
}

export function initNavMemory() {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void recordClosePriors(tabId);
  });
}
