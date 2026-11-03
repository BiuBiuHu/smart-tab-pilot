/**
 * Side-panel drag-to-merge: any task (or tab) onto any other task.
 * Strengthens learning for that URL pair set via TASK_FEEDBACK.
 */

/**
 * @typedef {{ tabId: number, url?: string }} ViewTab
 * @typedef {{ id: string, tabs: ViewTab[] }} ViewCluster
 * @typedef {{ kind: 'cluster'|'tab', clusterId: string, tabId?: number }} DragSource
 * @typedef {{
 *   action: 'merge',
 *   tabIds: number[],
 *   urlsA: string[],
 *   urlsB: string[],
 * }} DragMergePlan
 */

/**
 * Payload written to dataTransfer on dragstart (cluster card or a single tab).
 * @param {{ isTab?: boolean, clusterId: string, tabId?: number }} input
 * @returns {DragSource | null}
 */
export function dragStartPayload(input) {
  const clusterId = input?.clusterId;
  if (!clusterId) return null;
  if (input.isTab) {
    const tabId = Number(input.tabId);
    if (!Number.isFinite(tabId)) return null;
    return { kind: 'tab', clusterId: String(clusterId), tabId };
  }
  return { kind: 'cluster', clusterId: String(clusterId) };
}

/**
 * Parse dataTransfer JSON from drop. Malformed / incomplete → null.
 * @param {string | undefined} raw
 * @returns {DragSource | null}
 */
export function parseDragSource(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const data = JSON.parse(raw);
    if (!data || (data.kind !== 'cluster' && data.kind !== 'tab')) return null;
    if (!data.clusterId) return null;
    if (data.kind === 'tab') {
      const tabId = Number(data.tabId);
      if (!Number.isFinite(tabId)) return null;
      return { kind: 'tab', clusterId: String(data.clusterId), tabId };
    }
    return { kind: 'cluster', clusterId: String(data.clusterId) };
  } catch {
    return null;
  }
}

/**
 * Core of side-panel onTaskDrop — no DOM. Returns the merge plan or null.
 * @param {{ dataJson?: string, source?: DragSource | null, targetClusterId: string, clusters: ViewCluster[] }} input
 * @returns {DragMergePlan | null}
 */
export function handleTaskDrop(input) {
  const source = input.source || parseDragSource(input.dataJson);
  if (!source || !input.targetClusterId) return null;
  return planDragMerge(source, { clusterId: input.targetClusterId }, input.clusters);
}

/**
 * TASK_FEEDBACK body after a successful drop. Caller sends MSG.TASK_FEEDBACK.
 * @param {DragMergePlan | null | undefined} plan
 * @param {{ allWindows?: boolean }} [extras]
 */
export function buildTaskFeedbackPayload(plan, extras = {}) {
  if (!plan || plan.action !== 'merge') return null;
  return {
    action: 'merge',
    tabIds: plan.tabIds.slice(),
    urlsA: (plan.urlsA || []).slice(),
    urlsB: (plan.urlsB || []).slice(),
    allWindows: Boolean(extras.allWindows),
  };
}

/**
 * 「与上一任务合并」is a special case of any-pair merge (index and index-1).
 * @param {ViewCluster[]} clusters
 * @param {number} index
 */
export function planMergePrev(clusters, index) {
  const list = clusters || [];
  if (!Number.isInteger(index) || index <= 0 || !list[index] || !list[index - 1]) return null;
  return planDragMerge(
    { kind: 'cluster', clusterId: list[index].id },
    { clusterId: list[index - 1].id },
    list,
  );
}

/**
 * After dragging a tab, the following click must not activate that tab.
 * @param {boolean} suppressTabClick
 * @param {boolean} clickOnTab
 */
export function consumeDragClickSuppress(suppressTabClick, clickOnTab) {
  if (!suppressTabClick) return { next: false, ignore: false };
  return { next: false, ignore: Boolean(clickOnTab) };
}

/**
 * @param {DragSource | null | undefined} source
 * @param {{ clusterId: string }} target
 * @param {ViewCluster[]} clusters
 * @returns {DragMergePlan | null}
 */
export function planDragMerge(source, target, clusters) {
  const list = clusters || [];
  const src = list.find((c) => c.id === source?.clusterId);
  const dst = list.find((c) => c.id === target?.clusterId);
  if (!src || !dst || src.id === dst.id) return null;

  if (source.kind === 'tab' && source.tabId != null) {
    const tab = (src.tabs || []).find((t) => t.tabId === source.tabId);
    if (!tab) return null;
    const others = (dst.tabs || []).filter((t) => t.tabId !== tab.tabId);
    if (!others.length && dst.tabs?.some((t) => t.tabId === tab.tabId)) return null;
    return {
      action: 'merge',
      tabIds: [tab.tabId, ...others.map((t) => t.tabId)],
      urlsA: tab.url ? [tab.url] : [],
      urlsB: others.map((t) => t.url).filter(Boolean),
    };
  }

  if (source.kind !== 'cluster') return null;
  const tabsA = src.tabs || [];
  const tabsB = dst.tabs || [];
  if (!tabsA.length || !tabsB.length) return null;
  return {
    action: 'merge',
    tabIds: [...tabsA, ...tabsB].map((t) => t.tabId),
    urlsA: tabsA.map((t) => t.url).filter(Boolean),
    urlsB: tabsB.map((t) => t.url).filter(Boolean),
  };
}
