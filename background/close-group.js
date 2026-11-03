/**
 * Close every live tab in a logical task/group, then refresh the task view.
 * Session id-edges are pruned so closed tab ids cannot linger.
 */
import { applyCloseGroupPlan } from '../shared/close-group.js';
import { getTaskView } from './grouping.js';
import { loadSessionFeedback, pruneSessionFeedbackForTabs } from './nav-memory.js';

/**
 * @param {{
 *   clusterId?: string,
 *   tabIds?: number[],
 *   allWindows?: boolean,
 *   currentWindowId?: number | null,
 * }} payload
 */
export async function closeTaskGroup(payload = {}) {
  const allWindows = payload.allWindows !== false;
  const view = await getTaskView({ allWindows });
  const cluster =
    (payload.clusterId && view.clusters.find((c) => c.id === payload.clusterId)) || null;
  const live = await chrome.tabs.query({});
  const liveTabIds = live.map((t) => t.id).filter((id) => id != null);
  const session = await loadSessionFeedback();
  const result = applyCloseGroupPlan({
    cluster,
    tabIds: Array.isArray(payload.tabIds) ? payload.tabIds : [],
    allWindows,
    currentWindowId: payload.currentWindowId ?? view.currentWindowId,
    liveTabIds,
    session,
  });

  if (result.tabIds.length) {
    await pruneSessionFeedbackForTabs(result.tabIds);
  }

  let closed = 0;
  let failed = 0;
  if (result.toRemove.length) {
    try {
      await chrome.tabs.remove(result.toRemove);
      closed = result.toRemove.length;
    } catch {
      for (const id of result.toRemove) {
        try {
          await chrome.tabs.remove(id);
          closed += 1;
        } catch {
          failed += 1;
        }
      }
    }
  }

  const nextView = await getTaskView({ allWindows });
  return {
    ok: true,
    closed,
    alreadyGone: result.alreadyGone.length,
    failed,
    clusterId: result.clusterId || payload.clusterId || '',
    ...nextView,
  };
}
