/**
 * Close a logical task/group: pick tabIds by view scope, then prune session
 * edges so closed tab ids cannot linger (Chrome may reuse tab ids).
 */

/**
 * @typedef {{ tabId: number, windowId?: number }} ViewTab
 * @typedef {{ id?: string, tabs?: ViewTab[] }} ViewCluster
 */

/**
 * Which tabs of a logical group should close for the current panel scope.
 * all-windows: every tab on the card. current-window-only: only that window.
 *
 * @param {ViewCluster | null | undefined} cluster
 * @param {{ allWindows?: boolean, currentWindowId?: number | null }} [scope]
 * @returns {{ clusterId: string, tabIds: number[], windowIds: number[] }}
 */
export function planCloseGroup(cluster, scope = {}) {
  const tabs = Array.isArray(cluster?.tabs) ? cluster.tabs : [];
  const allWindows = scope.allWindows !== false;
  const currentWindowId = scope.currentWindowId;
  const picked = [];
  for (const t of tabs) {
    const tabId = Number(t?.tabId);
    if (!Number.isFinite(tabId)) continue;
    if (!allWindows) {
      if (currentWindowId == null) continue;
      if (t.windowId !== currentWindowId) continue;
    }
    picked.push({ tabId, windowId: t.windowId });
  }
  const tabIds = [...new Set(picked.map((t) => t.tabId))];
  const windowIds = [...new Set(picked.map((t) => t.windowId).filter((id) => id != null))];
  return {
    clusterId: cluster?.id ? String(cluster.id) : '',
    tabIds,
    windowIds,
  };
}

/**
 * TASK_FEEDBACK payload is untouched. This is the CLOSE_TASK_GROUP body.
 * @param {ViewCluster | null | undefined} cluster
 * @param {{ allWindows?: boolean, currentWindowId?: number | null }} [scope]
 */
export function buildCloseGroupPayload(cluster, scope = {}) {
  const plan = planCloseGroup(cluster, scope);
  return {
    clusterId: plan.clusterId,
    tabIds: plan.tabIds,
    allWindows: scope.allWindows !== false,
    currentWindowId: scope.currentWindowId ?? null,
  };
}

/**
 * Drop session merge/split pairs that mention any closed tab id.
 * Durable URL priors are NOT cleared (those are pattern learning, not live ids).
 *
 * @param {{ merges?: [number, number][], splits?: [number, number][] } | null | undefined} state
 * @param {number[]} closedTabIds
 */
export function dropClosedTabsFromSession(state, closedTabIds) {
  const gone = new Set((closedTabIds || []).filter((n) => Number.isFinite(n)));
  const keep = (pair) =>
    Array.isArray(pair) &&
    pair.length >= 2 &&
    Number.isFinite(pair[0]) &&
    Number.isFinite(pair[1]) &&
    !gone.has(pair[0]) &&
    !gone.has(pair[1]);
  return {
    merges: (state?.merges || []).filter(keep),
    splits: (state?.splits || []).filter(keep),
  };
}

/**
 * @param {number[]} requestedIds
 * @param {Iterable<number>} liveTabIds
 */
export function partitionRemovableTabIds(requestedIds, liveTabIds) {
  const live = new Set(liveTabIds || []);
  const requested = [...new Set((requestedIds || []).filter((n) => Number.isFinite(n)))];
  return {
    toRemove: requested.filter((id) => live.has(id)),
    alreadyGone: requested.filter((id) => !live.has(id)),
  };
}

/**
 * Message-path core (no Chrome): plan → partition live ids → prune session.
 *
 * @param {{
 *   cluster?: ViewCluster | null,
 *   tabIds?: number[],
 *   allWindows?: boolean,
 *   currentWindowId?: number | null,
 *   liveTabIds?: Iterable<number>,
 *   session?: { merges?: [number, number][], splits?: [number, number][] },
 * }} input
 */
export function applyCloseGroupPlan(input) {
  const fromCluster = input.cluster
    ? planCloseGroup(input.cluster, {
        allWindows: input.allWindows,
        currentWindowId: input.currentWindowId,
      })
    : { clusterId: '', tabIds: [], windowIds: [] };
  const tabIds = input.cluster
    ? fromCluster.tabIds
    : [...new Set((input.tabIds || []).filter((n) => Number.isFinite(n)))];
  const part = partitionRemovableTabIds(tabIds, input.liveTabIds || []);
  return {
    clusterId: fromCluster.clusterId,
    tabIds,
    windowIds: fromCluster.windowIds,
    toRemove: part.toRemove,
    alreadyGone: part.alreadyGone,
    session: dropClosedTabsFromSession(input.session, tabIds),
  };
}
