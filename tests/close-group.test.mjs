/**
 * Close an entire logical task/group — plan, live-tab partition, session prune.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCloseGroupPlan,
  buildCloseGroupPayload,
  dropClosedTabsFromSession,
  partitionRemovableTabIds,
  planCloseGroup,
} from '../shared/close-group.js';
import { MSG } from '../shared/constants.js';
import { buildTaskClusters, recordSessionFeedback } from '../shared/task-graph.js';

const bettrYuque = {
  id: 'task-1',
  tabs: [
    { tabId: 101, windowId: 3, url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/it' },
    { tabId: 102, windowId: 5, url: 'https://bettr-promotion-dev-unio.page.alipay.net/home' },
    { tabId: 201, windowId: 1, url: 'https://yuque.antfin.com/ot2rzd/tech/bettr-prd' },
  ],
};

describe('planCloseGroup', () => {
  it('closes every tab of a cross-window logical group in all-windows mode', () => {
    const plan = planCloseGroup(bettrYuque, { allWindows: true });
    assert.equal(plan.clusterId, 'task-1');
    assert.deepEqual(plan.tabIds.sort((a, b) => a - b), [101, 102, 201]);
    assert.deepEqual(plan.windowIds.sort((a, b) => a - b), [1, 3, 5]);
  });

  it('current-window-only closes only tabs in that window', () => {
    const plan = planCloseGroup(bettrYuque, { allWindows: false, currentWindowId: 3 });
    assert.deepEqual(plan.tabIds, [101]);
    assert.deepEqual(plan.windowIds, [3]);
  });

  it('empty group / missing current window is a no-op', () => {
    assert.deepEqual(planCloseGroup({ id: 'task-x', tabs: [] }, { allWindows: true }).tabIds, []);
    assert.deepEqual(
      planCloseGroup(bettrYuque, { allWindows: false, currentWindowId: 99 }).tabIds,
      [],
    );
    assert.deepEqual(planCloseGroup(null, { allWindows: true }).tabIds, []);
  });
});

describe('partitionRemovableTabIds / session prune', () => {
  it('skips already-closed ids so a batch close cannot fail the rest', () => {
    const part = partitionRemovableTabIds([101, 102, 201], [101, 201]);
    assert.deepEqual(part.toRemove, [101, 201]);
    assert.deepEqual(part.alreadyGone, [102]);
  });

  it('drops session merge/split edges that mention closed tab ids (id reuse)', () => {
    const session = {
      merges: [
        [101, 102],
        [102, 201],
        [8, 9],
      ],
      splits: [[101, 4], [8, 7]],
    };
    const next = dropClosedTabsFromSession(session, [101, 102]);
    assert.deepEqual(next.merges, [[8, 9]]);
    assert.deepEqual(next.splits, [[8, 7]]);
  });

  it('does not rewrite durable learning — only session id pairs', () => {
    const kept = dropClosedTabsFromSession(
      { merges: [[1, 2]], splits: [] },
      [99],
    );
    assert.deepEqual(kept.merges, [[1, 2]]);
  });
});

describe('CLOSE_TASK_GROUP message path (Node simulation)', () => {
  it('happy path: all-windows close removes live tabs and prunes feedback', () => {
    const session = recordSessionFeedback({ merges: [], splits: [] }, 'merge', [101, 102, 201]);
    const payload = buildCloseGroupPayload(bettrYuque, { allWindows: true, currentWindowId: 3 });
    assert.equal(payload.clusterId, 'task-1');
    assert.ok(payload.tabIds.includes(201));

    const result = applyCloseGroupPlan({
      cluster: bettrYuque,
      tabIds: payload.tabIds,
      allWindows: true,
      currentWindowId: 3,
      liveTabIds: [101, 102, 201, 999],
      session,
    });
    assert.deepEqual(result.toRemove.sort((a, b) => a - b), [101, 102, 201]);
    assert.equal(result.alreadyGone.length, 0);
    assert.equal(result.session.merges.length, 0);

    const leftover = [
      { id: 999, windowId: 2, url: 'https://other.example/x', semanticLabel: '其他' },
    ];
    assert.equal(buildTaskClusters(leftover, { sessionMerges: result.session.merges }).length, 1);
  });

  it('edge: mixed windows + already-closed + empty leftover view', () => {
    const result = applyCloseGroupPlan({
      cluster: bettrYuque,
      allWindows: false,
      currentWindowId: 5,
      liveTabIds: [101, 201],
      session: { merges: [[102, 201]], splits: [] },
    });
    assert.deepEqual(result.tabIds, [102]);
    assert.deepEqual(result.toRemove, []);
    assert.deepEqual(result.alreadyGone, [102]);
    assert.deepEqual(result.session.merges, []);
  });

  it('unknown cluster falls back to explicit tabIds', () => {
    const result = applyCloseGroupPlan({
      cluster: null,
      tabIds: [5, 6, 5],
      liveTabIds: [6],
      session: { merges: [[5, 6]], splits: [] },
    });
    assert.deepEqual(result.toRemove, [6]);
    assert.deepEqual(result.alreadyGone, [5]);
    assert.deepEqual(result.session.merges, []);
  });

  it('message type is CLOSE_TASK_GROUP (not TASK_FEEDBACK)', () => {
    assert.equal(MSG.CLOSE_TASK_GROUP, 'CLOSE_TASK_GROUP');
    assert.notEqual(MSG.CLOSE_TASK_GROUP, MSG.TASK_FEEDBACK);
  });
});
