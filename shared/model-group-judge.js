/**
 * Second-layer same-group judgment on short tab summaries.
 * Slug / product keys only propose candidates. The model (or opener/time/feedback)
 * decides. Regex is never a merge authority.
 */
import { slugsRelated } from './project-affinity.js';

const HINT_STOP = new Set([
  'http', 'https', 'html', 'index', 'page', 'pages', 'www', 'com', 'net', 'org',
  'demo', 'console', 'login', 'home', 'main', 'docs', 'doc', 'wiki',
]);

/**
 * Cheap lexical hints from title+url+intro (not a merge decision).
 * @param {string} text
 */
export function lexicalHintTokens(text) {
  const raw = (text || '').toLowerCase();
  const parts = raw.match(/[a-z][a-z0-9]{3,}|[\u4e00-\u9fff]{2,}/g) || [];
  return [...new Set(parts.filter((p) => !HINT_STOP.has(p)))];
}

/**
 * @typedef {{ merges: [number, number][] }} ModelJudgment
 */

/**
 * Compact payload for Nano / custom — summaries only.
 * @param {import('./task-graph.js').TaskCluster[]} clusters
 * @param {Map<number, import('./tab-summary.js').TabSummary | null | undefined>} summariesByTab
 */
export function clusterProductKeys(cluster, summariesByTab) {
  const keys = new Set();
  for (const id of cluster?.tabIds || []) {
    const s = summariesByTab?.get(id);
    for (const k of s?.productKeys || s?.slugs || []) keys.add(k);
  }
  return [...keys];
}

/**
 * Clusters that share a canonical product feature (hint only).
 * @param {import('./task-graph.js').TaskCluster[]} clusters
 * @param {Map<number, import('./tab-summary.js').TabSummary | null | undefined>} summariesByTab
 * @returns {{ a: string, b: string, productKey: string }[]}
 */
function clusterHintBlob(cluster, summariesByTab, nodesById) {
  const bits = [];
  for (const id of cluster?.tabIds || []) {
    const s = summariesByTab?.get(id);
    const n = nodesById?.get(id);
    bits.push(s?.title || n?.title || '', s?.url || n?.url || '', s?.excerpt || '');
  }
  return bits.join(' ');
}

export function proposeCandidatePairs(clusters, summariesByTab, nodesById) {
  const list = clusters || [];
  /** @type {{ a: string, b: string, productKey: string }[]} */
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const ka = clusterProductKeys(list[i], summariesByTab);
      const kb = clusterProductKeys(list[j], summariesByTab);
      let hit = '';
      for (const x of ka) {
        for (const y of kb) {
          if (slugsRelated(x, y) || x === y) {
            hit = x.includes('-') && x.length >= y.length ? x : y;
            break;
          }
        }
        if (hit) break;
      }
      if (!hit) {
        const ta = new Set(lexicalHintTokens(clusterHintBlob(list[i], summariesByTab, nodesById)));
        const tb = lexicalHintTokens(clusterHintBlob(list[j], summariesByTab, nodesById));
        hit = tb.find((t) => ta.has(t)) || '';
      }
      if (hit) pairs.push({ a: list[i].id, b: list[j].id, productKey: hit });
    }
  }
  return pairs;
}

/**
 * @param {import('./task-graph.js').TaskCluster[]} clusters
 * @param {Map<number, import('./tab-summary.js').TabSummary | null | undefined>} summariesByTab
 * @param {Map<number, import('./task-graph.js').TaskNode> | undefined} nodesById
 */
export function buildJudgePayload(clusters, summariesByTab, nodesById) {
  const items = (clusters || []).map((c) => ({
    id: c.id,
    label: c.label,
    tabIds: c.tabIds.slice(),
    productKeys: clusterProductKeys(c, summariesByTab),
    summaries: c.tabIds
      .map((id) => {
        const s = summariesByTab?.get(id);
        const n = nodesById?.get(id);
        const title = s?.title || n?.title || '';
        const url = s?.url || n?.url || '';
        const intro = s?.excerpt || '';
        if (!title && !url && !intro) return null;
        const nav = [];
        if (n?.referrerUrl) nav.push(`referrer ${n.referrerUrl}`);
        if (n?.openerTabId != null) nav.push(`openerTab ${n.openerTabId}`);
        return {
          tabId: id,
          title,
          url,
          intro,
          nav: nav.join('; '),
          pathKey: s?.pathKey || '',
          slugs: (s?.slugs || []).slice(0, 4),
          productKeys: (s?.productKeys || []).slice(0, 4),
        };
      })
      .filter(Boolean),
  }));
  return {
    clusters: items,
    candidates: proposeCandidatePairs(clusters, summariesByTab, nodesById),
  };
}

/**
 * Parse model JSON. Extra keys ignored; malformed → empty merges.
 * @param {string | undefined} raw
 * @returns {ModelJudgment}
 */
export function parseJudgeResponse(raw) {
  const empty = { merges: /** @type {[number, number][]} */ ([]) };
  if (!raw || typeof raw !== 'string') return empty;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try {
    const data = JSON.parse(text);
    const rows = Array.isArray(data?.merges) ? data.merges : [];
    /** @type {[number, number][]} */
    const merges = [];
    const seen = new Set();
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const a = Number(row[0]);
      const b = Number(row[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merges.push(a < b ? [a, b] : [b, a]);
    }
    return { merges };
  } catch {
    return empty;
  }
}

/**
 * Apply extra model merges via the same union-find builder.
 * Session splits still win. Project / opener unions are recomputed (not undone).
 * @param {import('./task-graph.js').TaskNode[]} nodes
 * @param {import('./task-graph.js').TaskCluster[]} clusters
 * @param {ModelJudgment | null | undefined} judgment
 * @param {Parameters<typeof import('./task-graph.js').buildTaskClusters>[1]} buildOpts
 * @param {(nodes: import('./task-graph.js').TaskNode[], opts: object) => import('./task-graph.js').TaskCluster[]} build
 */
export function applyModelJudgment(nodes, clusters, judgment, buildOpts, build) {
  const merges = judgment?.merges || [];
  if (!merges.length || typeof build !== 'function') return clusters;
  const extraUnions = merges.map(([a, b]) => /** @type {[number, number]} */ ([a, b]));
  return build(nodes, { ...(buildOpts || {}), extraUnions });
}

/**
 * Prompt body: one line per tab, summaries only.
 * @param {ReturnType<typeof buildJudgePayload>} payload
 */
export function formatJudgeUserPrompt(payload) {
  const lines = [];
  lines.push(
    'Decide from title + full URL + intro. Slugs are hints only. Cross-window is not a split reason.',
  );
  if (payload.candidates?.length) {
    lines.push('Candidate cluster pairs (not a decision):');
    for (const p of payload.candidates) {
      lines.push(`  ${p.a} ↔ ${p.b}  hint=${p.productKey}`);
    }
  }
  for (const c of payload.clusters || []) {
    const keys = (c.productKeys || []).join(',') || '-';
    lines.push(`cluster ${c.id} (${c.label}) productKeys=${keys}:`);
    for (const s of c.summaries || []) {
      lines.push(`  tab ${s.tabId}:`);
      if (s.title) lines.push(`    title: ${s.title}`);
      if (s.url) lines.push(`    url: ${s.url}`);
      if (s.intro) lines.push(`    intro: ${s.intro}`);
      if (s.nav) lines.push(`    nav: ${s.nav}`);
    }
  }
  return lines.join('\n') || 'no summaries';
}

/**
 * Turn cluster-id candidate pairs the model accepted into tabId unions
 * (first tab of each cluster). Used by tests and as a fallback parse.
 * @param {import('./task-graph.js').TaskCluster[]} clusters
 * @param {{ a: string, b: string }[]} accepted
 * @returns {[number, number][]}
 */
export function tabMergesFromClusterPairs(clusters, accepted) {
  const byId = new Map((clusters || []).map((c) => [c.id, c]));
  /** @type {[number, number][]} */
  const out = [];
  for (const p of accepted || []) {
    const a = byId.get(p.a)?.tabIds?.[0];
    const b = byId.get(p.b)?.tabIds?.[0];
    if (a == null || b == null || a === b) continue;
    out.push(a < b ? [a, b] : [b, a]);
  }
  return out;
}
