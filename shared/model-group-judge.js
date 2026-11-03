/**
 * Second-layer same-group judgment on short tab summaries.
 * Slug / product keys only propose candidates. The model (or opener/time/feedback)
 * decides. Regex is never a merge authority.
 */
import { slugsRelated } from './project-affinity.js';
import { formatSummaryLine } from './tab-summary.js';

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
export function proposeCandidatePairs(clusters, summariesByTab) {
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
      if (hit) pairs.push({ a: list[i].id, b: list[j].id, productKey: hit });
    }
  }
  return pairs;
}

export function buildJudgePayload(clusters, summariesByTab) {
  const items = (clusters || []).map((c) => ({
    id: c.id,
    label: c.label,
    tabIds: c.tabIds.slice(),
    productKeys: clusterProductKeys(c, summariesByTab),
    summaries: c.tabIds
      .map((id) => {
        const s = summariesByTab?.get(id);
        if (!s) return null;
        return {
          tabId: id,
          title: s.title || '',
          pathKey: s.pathKey || '',
          slugs: (s.slugs || []).slice(0, 4),
          productKeys: (s.productKeys || []).slice(0, 4),
          excerpt: s.excerpt || '',
        };
      })
      .filter(Boolean),
  }));
  return {
    clusters: items,
    candidates: proposeCandidatePairs(clusters, summariesByTab),
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
    'Product keys / slugs are CANDIDATE HINTS only. Decide from the summaries.',
    'Do not merge just because a key matches. Cross-window is not a reason to split.',
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
      lines.push(
        `  tab ${s.tabId}: ${formatSummaryLine({
          title: s.title,
          url: '',
          pathKey: s.pathKey,
          slugs: s.slugs,
          productKeys: s.productKeys,
          excerpt: s.excerpt,
          extractedAt: 0,
        })}`,
      );
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
