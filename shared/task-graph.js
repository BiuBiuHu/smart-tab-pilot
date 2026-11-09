/**
 * 任务导航图 (session/task navigation graph).
 *
 * Rules form CANDIDATES only (opener, referrer, time adjacency, project path,
 * learned priors). Same Chrome window and open-time adjacency never hard-merge.
 *
 * Conservative unions (no-model fallback, prefer split over false merge):
 *   1. User session merge / model extraUnions
 *   2. True navigation opener (tab born with a real destination URL — not Ctrl+T)
 *   3. document.referrer matching another open tab
 *
 * Same-task / same-project judgment is model-first on title + URL + summary.
 * Project regex is NOT a union authority. Semantic labels name clusters and
 * only sub-split mixed weak components.
 *
 * Union-find / connected components. Session merge/split overrides are the
 * extension point for user feedback (weights adjusted separately in nav-priors).
 */
import { LEARNED_UNION_THRESHOLD, TIME_ADJACENCY_MS } from './constants.js';
import { priorWeight } from './nav-priors.js';
import { projectDisplayName, sharesProjectAffinity } from './project-affinity.js';
import { isEphemeralNewTabUrl } from './url-utils.js';

/**
 * @typedef {{
 *   id: number,
 *   windowId: number,
 *   openerTabId?: number | null,
 *   openerFromNavigation?: boolean,
 *   birthUrl?: string,
 *   pendingUrl?: string,
 *   createdAt?: number,
 *   url?: string,
 *   title?: string,
 *   referrerUrl?: string,
 *   semanticLabel?: string,
 *   summary?: import('./tab-summary.js').TabSummary,
 * }} TaskNode
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   tabIds: number[],
 *   windowIds: number[],
 *   edges: { opener: number, referrer: number, project: number, time: number, learned: number, feedback: number, model: number },
 * }} TaskCluster
 */

class UnionFind {
  /** @param {number[]} ids */
  constructor(ids) {
    /** @type {Map<number, number>} */
    this.parent = new Map();
    for (const id of ids) this.parent.set(id, id);
  }
  /** @param {number} x */
  find(x) {
    let p = this.parent.get(x);
    if (p == null) {
      this.parent.set(x, x);
      return x;
    }
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  /** @param {number} a @param {number} b */
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/**
 * @param {string | undefined} label
 */
export function normalizeTopicLabel(label) {
  return (label || '').trim().toLowerCase();
}

/**
 * Compatible = missing / 未分类 / equal. Different real topics do not merge on weak edges.
 * @param {string | undefined} a
 * @param {string | undefined} b
 */
export function labelsCompatible(a, b) {
  const na = normalizeTopicLabel(a);
  const nb = normalizeTopicLabel(b);
  if (!na || !nb || na === '未分类' || nb === '未分类') return true;
  return na === nb;
}

/**
 * True link / window.open / duplicate — not Chrome's tab-strip opener on Ctrl+T.
 * Missing evidence → not a hard merge (candidate only).
 * @param {TaskNode | null | undefined} node
 */
export function isReliableOpener(node) {
  if (!node || node.openerTabId == null) return false;
  if (node.openerFromNavigation === false) return false;
  if (node.openerFromNavigation === true) return true;
  const birth = node.birthUrl || node.pendingUrl || '';
  if (birth) return !isEphemeralNewTabUrl(birth);
  return false;
}

/** @param {number} a @param {number} b */
function pairKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * @param {TaskNode[]} nodes
 * @param {{
 *   timeWindowMs?: number,
 *   learnedThreshold?: number,
 *   priors?: { pairs?: Record<string, { weight?: number }> },
 *   sessionMerges?: [number, number][],
 *   sessionSplits?: [number, number][],
 *   extraUnions?: [number, number][],
 * }} [opts]
 * @returns {TaskCluster[]}
 */
export function buildTaskClusters(nodes, opts = {}) {
  const list = (nodes || []).filter((n) => n && n.id != null);
  const ids = list.map((n) => n.id);
  const byId = new Map(list.map((n) => [n.id, n]));
  const sessionMerges = opts.sessionMerges || [];
  const sessionSplits = new Set((opts.sessionSplits || []).map(([a, b]) => pairKey(a, b)));

  const blocked = (a, b) => sessionSplits.has(pairKey(a, b));

  /** @type {Set<string>} pairs that must stay together (opener / feedback merge / referrer) */
  const strongPairs = new Set();
  /** @type {{ a: number, b: number, kind: string }[]} */
  const usedEdges = [];

  const uf = new UnionFind(ids);

  const tryUnion = (a, b, kind, strong) => {
    if (a === b || !byId.has(a) || !byId.has(b) || blocked(a, b)) return false;
    uf.union(a, b);
    usedEdges.push({ a, b, kind });
    if (strong) strongPairs.add(pairKey(a, b));
    return true;
  };

  // 0) User feedback merge — strongest session override
  for (const [a, b] of sessionMerges) {
    tryUnion(a, b, 'feedback', true);
  }

  // 0b) Optional model same-group merges (second layer; still blocked by sessionSplits)
  for (const [a, b] of opts.extraUnions || []) {
    tryUnion(a, b, 'model', true);
  }

  // 1) True navigation opener only. Chrome tab-strip opener (Ctrl+T / New Tab)
  // is a candidate for the model, never a conservative hard-merge.
  for (const n of list) {
    if (isReliableOpener(n)) {
      tryUnion(n.id, n.openerTabId, 'opener', true);
    }
  }

  // 2) True referrer / click-source → another open tab (document.referrer).
  for (const n of list) {
    const ref = (n.referrerUrl || '').trim();
    if (!ref) continue;
    for (const other of list) {
      if (other.id === n.id) continue;
      if ((other.url || '') === ref) {
        tryUnion(n.id, other.id, 'referrer', true);
      }
    }
  }

  // Time adjacency, same window, learned priors, and project slug/path are
  // NEVER union keys. collectRuleCandidates() exposes them as model hints.

  // Semantic is NOT a union key. Sub-split weak-only components with mixed topics.
  /** @type {Map<number, number[]>} */
  const groups = new Map();
  for (const id of ids) {
    const root = uf.find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }

  /** @type {number[][]} */
  const refined = [];
  for (const memberIds of groups.values()) {
    refined.push(...subSplitIfWeakMixed(memberIds, byId, strongPairs));
  }

  return refined
    .map((memberIds, idx) => toCluster(memberIds, idx, byId, usedEdges))
    .sort((a, b) => b.tabIds.length - a.tabIds.length || a.id.localeCompare(b.id));
}

/**
 * Weak same-task hints for the model. Never a merge decision.
 * @param {TaskNode[]} nodes
 * @param {{
 *   timeWindowMs?: number,
 *   learnedThreshold?: number,
 *   priors?: { pairs?: Record<string, { weight?: number }> },
 *   sessionSplits?: [number, number][],
 * }} [opts]
 * @returns {{ a: number, b: number, kind: string }[]}
 */
export function collectRuleCandidates(nodes, opts = {}) {
  const list = (nodes || []).filter((n) => n && n.id != null);
  const timeWindowMs = opts.timeWindowMs ?? TIME_ADJACENCY_MS;
  const learnedThreshold = opts.learnedThreshold ?? LEARNED_UNION_THRESHOLD;
  const priors = opts.priors || { pairs: {} };
  const sessionSplits = new Set((opts.sessionSplits || []).map(([a, b]) => pairKey(a, b)));
  /** @type {{ a: number, b: number, kind: string }[]} */
  const pairs = [];
  const seen = new Set();

  const add = (a, b, kind) => {
    if (a == null || b == null || a === b) return;
    if (sessionSplits.has(pairKey(a, b))) return;
    const key = `${pairKey(a, b)}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ a: a < b ? a : b, b: a < b ? b : a, kind });
  };

  for (const n of list) {
    if (n.openerTabId == null) continue;
    if (!list.some((other) => other.id === n.openerTabId)) continue;
    add(n.id, n.openerTabId, isReliableOpener(n) ? 'opener' : 'opener-weak');
  }

  for (const n of list) {
    const ref = (n.referrerUrl || '').trim();
    if (!ref) continue;
    for (const other of list) {
      if (other.id === n.id) continue;
      if ((other.url || '') === ref) add(n.id, other.id, 'referrer');
    }
  }

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (
        a.windowId === b.windowId &&
        a.createdAt != null &&
        b.createdAt != null &&
        Math.abs(a.createdAt - b.createdAt) <= timeWindowMs
      ) {
        add(a.id, b.id, 'time');
      }
      if (sharesProjectAffinity(a.url, b.url)) add(a.id, b.id, 'project');
      if (priorWeight(priors, a.url, b.url) >= learnedThreshold) add(a.id, b.id, 'learned');
    }
  }

  return pairs;
}

/**
 * If a component has mixed real topics AND no strong pair bridges those topic
 * groups, split by topic. Opener-connected mixed topics stay together.
 * @param {number[]} memberIds
 * @param {Map<number, TaskNode>} byId
 * @param {Set<string>} strongPairs
 * @returns {number[][]}
 */
export function subSplitIfWeakMixed(memberIds, byId, strongPairs) {
  if (memberIds.length <= 1) return [memberIds];

  /** @type {Map<string, number[]>} */
  const byLabel = new Map();
  for (const id of memberIds) {
    const label = normalizeTopicLabel(byId.get(id)?.semanticLabel) || '未分类';
    const bucket = label === '未分类' ? '未分类' : label;
    if (!byLabel.has(bucket)) byLabel.set(bucket, []);
    byLabel.get(bucket).push(id);
  }

  const realKeys = [...byLabel.keys()].filter((k) => k !== '未分类');
  if (realKeys.length <= 1) {
    return [memberIds];
  }

  // Strong subgraph is transitive: opener / referrer / project / feedback.
  // Semantic labels name the cluster — they must not split a strong component.
  const strongUf = new UnionFind(memberIds);
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      if (strongPairs.has(pairKey(memberIds[i], memberIds[j]))) {
        strongUf.union(memberIds[i], memberIds[j]);
      }
    }
  }
  /** @type {Map<number, string>} */
  const topicAtRoot = new Map();
  for (const id of memberIds) {
    const label = normalizeTopicLabel(byId.get(id)?.semanticLabel) || '未分类';
    if (!label || label === '未分类') continue;
    const root = strongUf.find(id);
    const prev = topicAtRoot.get(root);
    if (prev && prev !== label) {
      return [memberIds];
    }
    topicAtRoot.set(root, label);
  }

  const leftover = byLabel.get('未分类') || [];
  const parts = realKeys.map((k) => [...(byLabel.get(k) || [])]);
  // Attach unclassified to the largest topic part (refinement, not a new merge key)
  if (leftover.length && parts.length) {
    parts.sort((a, b) => b.length - a.length);
    parts[0].push(...leftover);
  }
  return parts.filter((p) => p.length);
}

/**
 * @param {number[]} memberIds
 * @param {number} idx
 * @param {Map<number, TaskNode>} byId
 * @param {{ a: number, b: number, kind: string }[]} usedEdges
 * @returns {TaskCluster}
 */
function toCluster(memberIds, idx, byId, usedEdges) {
  const idSet = new Set(memberIds);
  const edges = { opener: 0, referrer: 0, project: 0, time: 0, learned: 0, feedback: 0, model: 0 };
  for (const e of usedEdges) {
    if (idSet.has(e.a) && idSet.has(e.b) && e.kind in edges) {
      edges[/** @type {keyof typeof edges} */ (e.kind)] += 1;
    }
  }

  const nodes = memberIds.map((id) => byId.get(id)).filter(Boolean);
  const label = projectDisplayName(nodes) || majorityLabel(nodes);
  const windowIds = [...new Set(nodes.map((n) => n.windowId))];
  const seed = memberIds.slice().sort((a, b) => a - b)[0] ?? idx;
  return {
    id: `task-${seed}`,
    label,
    tabIds: memberIds.slice().sort((a, b) => a - b),
    windowIds,
    edges,
  };
}

/** @param {TaskNode[]} nodes */
export function majorityLabel(nodes) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const n of nodes) {
    const raw = (n.semanticLabel || '').trim();
    if (!raw || raw === '未分类') continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [label, n] of counts) {
    if (n > bestN || (n === bestN && label.length < best.length)) {
      best = label;
      bestN = n;
    }
  }
  if (best) return best;
  const titled = nodes.find((n) => (n.title || '').trim());
  if (titled?.title) {
    const t = titled.title.trim();
    return t.length > 24 ? t.slice(0, 20).trim() : t;
  }
  return '未分类';
}

/**
 * Session feedback records (pure). Used by nav-memory + tests.
 * @param {{ merges: [number, number][], splits: [number, number][] }} state
 * @param {'merge'|'split'} action
 * @param {number[]} tabIds
 */
export function recordSessionFeedback(state, action, tabIds) {
  const ids = [...new Set((tabIds || []).filter((n) => typeof n === 'number'))];
  const next = {
    merges: state.merges.map((p) => /** @type {[number, number]} */ ([p[0], p[1]])),
    splits: state.splits.map((p) => /** @type {[number, number]} */ ([p[0], p[1]])),
  };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const pair = /** @type {[number, number]} */ (
        ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]]
      );
      if (action === 'merge') {
        next.merges.push(pair);
        next.splits = next.splits.filter(([a, b]) => !(a === pair[0] && b === pair[1]));
      } else {
        next.splits.push(pair);
        next.merges = next.merges.filter(([a, b]) => !(a === pair[0] && b === pair[1]));
      }
    }
  }
  return next;
}
