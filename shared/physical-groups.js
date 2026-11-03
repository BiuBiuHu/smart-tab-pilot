/**
 * Physical chrome.tabGroups policy (one window).
 * Never create a second group with the same normalized title in one window.
 */
import { normalizeTopicLabel } from './task-graph.js';

/**
 * @param {string | undefined} label
 */
export function normalizeGroupTitle(label) {
  return normalizeTopicLabel(label).replace(/\s+/g, ' ');
}

/**
 * @typedef {{ id: number, title?: string }} GroupMeta
 * @typedef {{ id?: number, groupId?: number }} WindowTab
 */

/**
 * Which existing group to reuse.
 * 1) Same normalized title (collapse duplicates / join existing)
 * 2) Exclusive group already holding some of our tabs and no foreigners
 * @param {{
 *   groups?: GroupMeta[],
 *   windowTabs?: WindowTab[],
 *   tabIds?: number[],
 *   label?: string,
 *   noneId?: number,
 * }} input
 * @returns {number | null}
 */
export function pickReusableGroupId(input) {
  const groups = input.groups || [];
  const windowTabs = input.windowTabs || [];
  const tabIds = input.tabIds || [];
  const noneId = input.noneId ?? -1;
  const want = normalizeGroupTitle(input.label);

  if (want) {
    const match = groups.find((g) => g && normalizeGroupTitle(g.title) === want);
    if (match && typeof match.id === 'number') return match.id;
  }

  const inSet = new Set(tabIds);
  const seen = new Set();
  for (const t of windowTabs) {
    if (t.id == null || !inSet.has(t.id)) continue;
    if (typeof t.groupId !== 'number' || t.groupId === noneId || seen.has(t.groupId)) continue;
    seen.add(t.groupId);
    const foreign = windowTabs.some(
      (other) => other.groupId === t.groupId && other.id != null && !inSet.has(other.id),
    );
    if (!foreign) return t.groupId;
  }
  return null;
}

/**
 * Tabs already sitting in any same-title group (to fold leftover duplicates).
 * @param {{
 *   groups?: GroupMeta[],
 *   windowTabs?: WindowTab[],
 *   label?: string,
 *   already?: number[],
 * }} input
 * @returns {number[]}
 */
export function extraTabIdsToFold(input) {
  const want = normalizeGroupTitle(input.label);
  if (!want) return [];
  const already = new Set(input.already || []);
  const matchIds = new Set(
    (input.groups || [])
      .filter((g) => g && normalizeGroupTitle(g.title) === want)
      .map((g) => g.id),
  );
  if (!matchIds.size) return [];
  /** @type {number[]} */
  const extra = [];
  for (const t of input.windowTabs || []) {
    if (t.id == null || already.has(t.id)) continue;
    if (typeof t.groupId === 'number' && matchIds.has(t.groupId)) extra.push(t.id);
  }
  return extra;
}

/**
 * One physical placement per (windowId, normalized label).
 * Two logical clusters titled 「LinkE」 in the same window become one write.
 * @param {import('./task-graph.js').TaskCluster[]} clusters
 * @param {import('./task-graph.js').TaskNode[]} nodes
 * @returns {{ windowId: number, label: string, tabIds: number[] }[]}
 */
export function coalesceWindowPlacements(clusters, nodes) {
  const nodeById = new Map((nodes || []).map((n) => [n.id, n]));
  /** @type {Map<string, { windowId: number, label: string, tabIds: number[] }>} */
  const buckets = new Map();
  for (const cluster of clusters || []) {
    const label = cluster.label || '未分类';
    const norm = normalizeGroupTitle(label) || '未分类';
    for (const tabId of cluster.tabIds || []) {
      const n = nodeById.get(tabId);
      if (!n || n.windowId == null) continue;
      const key = `${n.windowId}::${norm}`;
      if (!buckets.has(key)) {
        buckets.set(key, { windowId: n.windowId, label, tabIds: [] });
      }
      buckets.get(key).tabIds.push(tabId);
    }
  }
  return [...buckets.values()].map((b) => ({
    ...b,
    tabIds: [...new Set(b.tabIds)],
  }));
}
