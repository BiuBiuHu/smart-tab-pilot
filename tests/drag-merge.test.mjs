/**
 * Drag any task/tab onto another task to merge that pair.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planDragMerge } from '../shared/drag-merge.js';

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

  it('ignores drop on the same task', () => {
    assert.equal(
      planDragMerge({ kind: 'cluster', clusterId: 'task-1' }, { clusterId: 'task-1' }, clusters),
      null,
    );
  });
});
