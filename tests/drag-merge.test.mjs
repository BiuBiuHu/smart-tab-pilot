/**
 * Drag any task/tab onto another task to merge that pair.
 * Node simulation of side-panel handlers + TASK_FEEDBACK learning.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyFeedbackAcrossUrlSets,
  emptyPriorStore,
  priorWeight,
} from '../shared/nav-priors.js';
import {
  buildTaskFeedbackPayload,
  consumeDragClickSuppress,
  dragStartPayload,
  handleTaskDrop,
  parseDragSource,
  planDragMerge,
  planMergePrev,
} from '../shared/drag-merge.js';
import { buildTaskClusters, recordSessionFeedback } from '../shared/task-graph.js';

const clusters = [
  {
    id: 'task-1',
    tabs: [
      { tabId: 1, url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/it' },
      { tabId: 2, url: 'https://bettr-promotion-dev-unio.page.alipay.net/x' },
    ],
  },
  {
    id: 'task-2',
    tabs: [
      { tabId: 10, url: 'https://yuque.antfin.com/prd' },
      { tabId: 11, url: 'https://yuque.antfin.com/tech' },
    ],
  },
  {
    id: 'task-3',
    tabs: [{ tabId: 20, url: 'https://github.com/foo/other' }],
  },
];

/** Minimal dataTransfer used by side-panel dragstart/drop. */
function createDataTransfer() {
  /** @type {Record<string, string>} */
  const store = {};
  return {
    effectAllowed: '',
    dropEffect: '',
    setData(type, value) {
      store[type] = String(value);
    },
    getData(type) {
      return store[type] || '';
    },
  };
}

function simulateHtml5Drag({ isTab, sourceClusterId, tabId, targetClusterId, list }) {
  const dt = createDataTransfer();
  const start = dragStartPayload({ isTab, clusterId: sourceClusterId, tabId });
  dt.setData('application/json', JSON.stringify(start));
  dt.setData('text/plain', JSON.stringify(start));
  return handleTaskDrop({
    dataJson: dt.getData('application/json') || dt.getData('text/plain'),
    targetClusterId,
    clusters: list || clusters,
  });
}

describe('planDragMerge', () => {
  it('merges any two task cards and returns both URL sets for learning', () => {
    const plan = planDragMerge(
      { kind: 'cluster', clusterId: 'task-2' },
      { clusterId: 'task-1' },
      clusters,
    );
    assert.ok(plan);
    assert.equal(plan.action, 'merge');
    assert.deepEqual(plan.tabIds.sort((a, b) => a - b), [1, 2, 10, 11]);
    assert.deepEqual(plan.urlsA, [
      'https://yuque.antfin.com/prd',
      'https://yuque.antfin.com/tech',
    ]);
    assert.deepEqual(plan.urlsB, [
      'https://www.marmot-cloud.com/bettr/bettr-promotion/it',
      'https://bettr-promotion-dev-unio.page.alipay.net/x',
    ]);
  });

  it('merges a dragged tab into the target task (not only the previous card)', () => {
    const plan = planDragMerge(
      { kind: 'tab', clusterId: 'task-3', tabId: 20 },
      { clusterId: 'task-1' },
      clusters,
    );
    assert.ok(plan);
    assert.equal(plan.urlsA[0], 'https://github.com/foo/other');
    assert.ok(plan.tabIds.includes(20));
    assert.ok(plan.tabIds.includes(1));
  });

  it('merges a non-adjacent pair (task-3 onto task-1, skipping the previous card)', () => {
    const plan = planDragMerge(
      { kind: 'cluster', clusterId: 'task-3' },
      { clusterId: 'task-1' },
      clusters,
    );
    assert.ok(plan);
    assert.deepEqual(plan.tabIds.sort((a, b) => a - b), [1, 2, 20]);
    assert.ok(!plan.tabIds.includes(10));
  });

  it('ignores drop on the same task', () => {
    assert.equal(
      planDragMerge({ kind: 'cluster', clusterId: 'task-1' }, { clusterId: 'task-1' }, clusters),
      null,
    );
  });
});

describe('side-panel drag handlers (Node simulation)', () => {
  it('dragStartPayload + parseDragSource round-trip cluster and tab', () => {
    const cluster = dragStartPayload({ isTab: false, clusterId: 'task-2' });
    const tab = dragStartPayload({ isTab: true, clusterId: 'task-3', tabId: 20 });
    assert.deepEqual(parseDragSource(JSON.stringify(cluster)), cluster);
    assert.deepEqual(parseDragSource(JSON.stringify(tab)), tab);
    assert.equal(parseDragSource('not-json'), null);
    assert.equal(parseDragSource('{"kind":"tab","clusterId":"x"}'), null);
    assert.equal(dragStartPayload({ isTab: true, clusterId: 'task-1' }), null);
  });

  it('HTML5 dataTransfer drop merges screenshot-style Bettr + yuque cards', () => {
    const plan = simulateHtml5Drag({
      isTab: false,
      sourceClusterId: 'task-2',
      targetClusterId: 'task-1',
    });
    assert.ok(plan);
    const msg = buildTaskFeedbackPayload(plan, { allWindows: true });
    assert.equal(msg.action, 'merge');
    assert.equal(msg.allWindows, true);
    assert.deepEqual(msg.tabIds.sort((a, b) => a - b), [1, 2, 10, 11]);
    assert.ok(msg.urlsA.some((u) => u.includes('yuque.antfin.com')));
    assert.ok(msg.urlsB.some((u) => u.includes('marmot-cloud.com')));
  });

  it('dropping a tab uses the same handler path as a task card', () => {
    const plan = simulateHtml5Drag({
      isTab: true,
      sourceClusterId: 'task-3',
      tabId: 20,
      targetClusterId: 'task-2',
    });
    assert.ok(plan);
    assert.deepEqual(plan.tabIds.sort((a, b) => a - b), [10, 11, 20]);
  });

  it('malformed drop / missing target is a no-op (no accidental merge-prev)', () => {
    assert.equal(
      handleTaskDrop({ dataJson: '{', targetClusterId: 'task-1', clusters }),
      null,
    );
    assert.equal(
      handleTaskDrop({
        dataJson: JSON.stringify({ kind: 'cluster', clusterId: 'missing' }),
        targetClusterId: 'task-1',
        clusters,
      }),
      null,
    );
    assert.equal(buildTaskFeedbackPayload(null), null);
  });

  it('merge-prev is only the adjacent special case; drag can skip it', () => {
    const prev = planMergePrev(clusters, 1);
    assert.ok(prev);
    assert.ok(prev.tabIds.includes(1) && prev.tabIds.includes(10));
    assert.equal(planMergePrev(clusters, 0), null);
    const skipPrev = simulateHtml5Drag({
      isTab: false,
      sourceClusterId: 'task-3',
      targetClusterId: 'task-1',
    });
    assert.ok(skipPrev);
    assert.ok(!skipPrev.tabIds.includes(10));
  });

  it('suppresses the click that follows a tab drag', () => {
    assert.deepEqual(consumeDragClickSuppress(false, true), { next: false, ignore: false });
    assert.deepEqual(consumeDragClickSuppress(true, true), { next: false, ignore: true });
    assert.deepEqual(consumeDragClickSuppress(true, false), { next: false, ignore: false });
  });
});

describe('drag merge strengthens learning for that pair', () => {
  it('TASK_FEEDBACK from drop writes session merge + prior +0.35 and reclusters', () => {
    const nodes = [
      {
        id: 1,
        windowId: 5,
        url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/it',
        title: 'bettr-promotion · Marmot',
        semanticLabel: 'Bettr Promotion',
      },
      {
        id: 10,
        windowId: 1,
        url: 'https://yuque.antfin.com/ot2rzd/tech/bettr-plan',
        title: 'BETTR信贷智能增长平台一期技术方案',
        semanticLabel: '批量发奖demo',
      },
      {
        id: 11,
        windowId: 1,
        url: 'https://yuque.antfin.com/ot2rzd/prd/prize',
        title: '批量发奖demo',
        semanticLabel: '批量发奖demo',
      },
    ];
    const view = [
      {
        id: 'task-1',
        tabs: [{ tabId: 1, url: nodes[0].url }],
      },
      {
        id: 'task-10',
        tabs: [
          { tabId: 10, url: nodes[1].url },
          { tabId: 11, url: nodes[2].url },
        ],
      },
    ];
    assert.equal(buildTaskClusters(nodes).length, 3);

    const plan = simulateHtml5Drag({
      isTab: false,
      sourceClusterId: 'task-10',
      targetClusterId: 'task-1',
      list: view,
    });
    const msg = buildTaskFeedbackPayload(plan, { allWindows: true });
    const session = recordSessionFeedback({ merges: [], splits: [] }, msg.action, msg.tabIds);
    const priors = applyFeedbackAcrossUrlSets(
      emptyPriorStore(),
      msg.urlsA,
      msg.urlsB,
      'merge',
      1,
    );

    assert.ok(session.merges.length >= 1);
    assert.ok(
      priorWeight(priors, nodes[1].url, nodes[0].url) >= 0.35,
      'drag merge must strengthen the yuque↔marmot pair',
    );
    assert.ok(priorWeight(priors, nodes[2].url, nodes[0].url) >= 0.35);

    const next = buildTaskClusters(nodes, { sessionMerges: session.merges, priors });
    assert.equal(next.length, 1);
    assert.ok(next[0].edges.feedback >= 1);
    assert.deepEqual(next[0].tabIds.sort((a, b) => a - b), [1, 10, 11]);
  });

  it('split remains available after a drag merge (session split wins)', () => {
    const nodes = [
      { id: 1, windowId: 1, url: 'https://a.example/docs/x', semanticLabel: '甲' },
      { id: 2, windowId: 1, url: 'https://b.example/run/y', semanticLabel: '乙' },
    ];
    const merged = recordSessionFeedback({ merges: [], splits: [] }, 'merge', [1, 2]);
    assert.equal(buildTaskClusters(nodes, { sessionMerges: merged.merges }).length, 1);
    const split = recordSessionFeedback(merged, 'split', [1, 2]);
    assert.equal(
      buildTaskClusters(nodes, { sessionMerges: split.merges, sessionSplits: split.splits }).length,
      2,
    );
  });
});
