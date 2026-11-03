/**
 * Durable weak priors for 任务导航图 / navigation graph learning.
 * Pure functions — persist via background/nav-memory.js.
 *
 * A prior is an origin+path pattern pair that co-occurred via opener / time /
 * user feedback. Future similar navigations strengthen association.
 * Hostname-only pairs are rejected (no domain aggregation).
 */
import { EDGE_WEIGHT, NAV_PRIORS_CAP } from './constants.js';
import { isShallowPattern, priorPairKey, toUrlPattern } from './url-pattern.js';

/**
 * @typedef {{ weight: number, count: number, lastSeen: number, sources: { opener?: number, time?: number, feedback?: number } }} PriorEntry
 * @typedef {{ version: 1, pairs: Record<string, PriorEntry> }} PriorStore
 */

/** @returns {PriorStore} */
export function emptyPriorStore() {
  return { version: 1, pairs: {} };
}

/**
 * @param {unknown} raw
 * @returns {PriorStore}
 */
export function normalizePriorStore(raw) {
  if (!raw || typeof raw !== 'object') return emptyPriorStore();
  const obj = /** @type {Record<string, unknown>} */ (raw);
  const pairs = obj.pairs && typeof obj.pairs === 'object' ? obj.pairs : {};
  return { version: 1, pairs: /** @type {Record<string, PriorEntry>} */ ({ ...pairs }) };
}

/**
 * Whether two live URLs may receive a durable prior.
 * Rejects missing/shallow/identical patterns (identical = same template, not a cross-site task cue).
 * @param {string | undefined} urlA
 * @param {string | undefined} urlB
 */
export function canStorePrior(urlA, urlB) {
  const a = toUrlPattern(urlA);
  const b = toUrlPattern(urlB);
  if (!a || !b) return false;
  if (a === b) return false;
  if (isShallowPattern(a) || isShallowPattern(b)) return false;
  return true;
}

/**
 * @param {PriorStore} store
 * @param {string | undefined} urlA
 * @param {string | undefined} urlB
 * @param {{ source: 'opener'|'time'|'feedback', delta: number, now?: number }} ev
 * @returns {PriorStore}
 */
export function bumpPrior(store, urlA, urlB, ev) {
  const next = normalizePriorStore(store);
  if (!canStorePrior(urlA, urlB)) return next;
  const key = priorPairKey(toUrlPattern(urlA), toUrlPattern(urlB));
  const now = ev.now ?? Date.now();
  const prev = next.pairs[key] || { weight: 0, count: 0, lastSeen: 0, sources: {} };
  const weight = clampWeight((prev.weight || 0) + ev.delta);
  const sources = { ...prev.sources };
  sources[ev.source] = (sources[ev.source] || 0) + 1;
  next.pairs[key] = {
    weight,
    count: (prev.count || 0) + 1,
    lastSeen: now,
    sources,
  };
  evictIfNeeded(next, now);
  return next;
}

/**
 * @param {PriorStore} store
 * @param {string | undefined} urlA
 * @param {string | undefined} urlB
 * @returns {number} learned weight, 0 if unknown
 */
export function priorWeight(store, urlA, urlB) {
  const a = toUrlPattern(urlA);
  const b = toUrlPattern(urlB);
  if (!a || !b || a === b) return 0;
  const entry = store?.pairs?.[priorPairKey(a, b)];
  return entry && typeof entry.weight === 'number' ? entry.weight : 0;
}

/**
 * User feedback extension point: merge strengthens, split weakens.
 * @param {PriorStore} store
 * @param {string | undefined} urlA
 * @param {string | undefined} urlB
 * @param {'merge'|'split'} action
 * @param {number} [now]
 */
export function applyFeedbackToPriors(store, urlA, urlB, action, now) {
  const delta =
    action === 'merge' ? EDGE_WEIGHT.FEEDBACK_MERGE_DELTA : EDGE_WEIGHT.FEEDBACK_SPLIT_DELTA;
  return bumpPrior(store, urlA, urlB, { source: 'feedback', delta, now });
}

/**
 * Apply feedback across two tab URL lists (all cross pairs).
 * @param {PriorStore} store
 * @param {string[]} urlsA
 * @param {string[]} urlsB
 * @param {'merge'|'split'} action
 * @param {number} [now]
 */
export function applyFeedbackAcrossUrlSets(store, urlsA, urlsB, action, now) {
  let next = normalizePriorStore(store);
  for (const a of urlsA) {
    for (const b of urlsB) {
      next = applyFeedbackToPriors(next, a, b, action, now);
    }
  }
  return next;
}

/** @param {number} w */
function clampWeight(w) {
  if (Number.isNaN(w)) return 0;
  return Math.max(-1, Math.min(1.5, w));
}

/** @param {PriorStore} store @param {number} now */
function evictIfNeeded(store, now) {
  const keys = Object.keys(store.pairs);
  if (keys.length <= NAV_PRIORS_CAP) return;
  keys
    .sort((a, b) => (store.pairs[a]?.lastSeen || 0) - (store.pairs[b]?.lastSeen || 0))
    .slice(0, keys.length - NAV_PRIORS_CAP)
    .forEach((k) => {
      delete store.pairs[k];
    });
  void now;
}
