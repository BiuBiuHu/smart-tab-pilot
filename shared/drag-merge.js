/**
 * Side-panel drag-to-merge: any task (or tab) onto any other task.
 * Strengthens learning for that URL pair set via TASK_FEEDBACK.
 */

/**
 * @typedef {{ tabId: number, url?: string }} ViewTab
 * @typedef {{ id: string, tabs: ViewTab[] }} ViewCluster
 *
 * @param {{ kind: 'cluster'|'tab', clusterId: string, tabId?: number }} source
 * @param {{ clusterId: string }} target
 * @param {ViewCluster[]} clusters
 * @returns {{
 *   action: 'merge',
 *   tabIds: number[],
 *   urlsA: string[],
 *   urlsB: string[],
 * } | null}
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
