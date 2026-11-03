/**
 * Second-layer same-group judgment on short tab summaries.
 * Rules (task-graph / project affinity) run first. This hook only adds merges.
 * It never stores or requires a full page body.
 */
import { formatSummaryLine } from './tab-summary.js';

/**
 * @typedef {{ merges: [number, number][] }} ModelJudgment
 */

/**
 * Compact payload for Nano / custom — summaries only.
 * @param {import('./task-graph.js').TaskCluster[]} clusters
 * @param {Map<number, import('./tab-summary.js').TabSummary | null | undefined>} summariesByTab
 */
export function buildJudgePayload(clusters, summariesByTab) {
  const items = (clusters || []).map((c) => ({
    id: c.id,
    label: c.label,
    tabIds: c.tabIds.slice(),
    summaries: c.tabIds
      .map((id) => {
        const s = summariesByTab?.get(id);
        if (!s) return null;
        return {
          tabId: id,
          title: s.title || '',
          pathKey: s.pathKey || '',
          slugs: (s.slugs || []).slice(0, 4),
          excerpt: s.excerpt || '',
        };
      })
      .filter(Boolean),
  }));
  return { clusters: items };
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
  for (const c of payload.clusters || []) {
    lines.push(`cluster ${c.id} (${c.label}):`);
    for (const s of c.summaries || []) {
      lines.push(
        `  tab ${s.tabId}: ${formatSummaryLine({
          title: s.title,
          url: '',
          pathKey: s.pathKey,
          slugs: s.slugs,
          excerpt: s.excerpt,
          extractedAt: 0,
        })}`,
      );
    }
  }
  return lines.join('\n') || 'no summaries';
}
