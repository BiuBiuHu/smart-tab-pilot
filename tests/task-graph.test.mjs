/**
 * 任务导航图 unit tests (pure clustering, no Chrome APIs).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyPriorStore, bumpPrior } from '../shared/nav-priors.js';
import {
  buildTaskClusters,
  labelsCompatible,
  majorityLabel,
  recordSessionFeedback,
} from '../shared/task-graph.js';

function tab(partial) {
  return {
    id: partial.id,
    windowId: partial.windowId ?? 1,
    openerTabId: partial.openerTabId ?? null,
    createdAt: partial.createdAt,
    url: partial.url,
    title: partial.title,
    referrerUrl: partial.referrerUrl,
    semanticLabel: partial.semanticLabel,
  };
}

function clusterOf(clusters, tabId) {
  return clusters.find((c) => c.tabIds.includes(tabId));
}

describe('labelsCompatible', () => {
  it('treats empty / 未分类 as compatible', () => {
    assert.equal(labelsCompatible('', 'API 文档'), true);
    assert.equal(labelsCompatible('未分类', 'API 文档'), true);
  });
  it('rejects two different real topics', () => {
    assert.equal(labelsCompatible('React hooks', 'Kubernetes'), false);
  });
});

describe('buildTaskClusters — opener is strongest', () => {
  it('keeps an opener chain together even when topics differ', () => {
    const clusters = buildTaskClusters([
      tab({
        id: 1,
        url: 'https://github.com/acme/app/pull/11',
        semanticLabel: '代码评审',
        createdAt: 1000,
      }),
      tab({
        id: 2,
        openerTabId: 1,
        url: 'https://stackoverflow.com/q/123',
        semanticLabel: '排错问答',
        createdAt: 1500,
      }),
      tab({
        id: 3,
        openerTabId: 2,
        url: 'https://docs.example.com/auth',
        semanticLabel: 'API 文档',
        createdAt: 2000,
      }),
    ]);
    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters[0].tabIds, [1, 2, 3]);
    assert.ok(clusters[0].edges.opener >= 2);
  });
});

describe('buildTaskClusters — same domain must split by topic when tasks differ', () => {
  it('does not merge same-host tabs without opener/time/learned edges', () => {
    const clusters = buildTaskClusters([
      tab({
        id: 10,
        url: 'https://github.com/foo/react-hooks-guide',
        semanticLabel: 'React hooks 入门',
        createdAt: 1_000,
      }),
      tab({
        id: 20,
        url: 'https://github.com/foo/k8s-net',
        semanticLabel: 'Kubernetes 排错',
        createdAt: 3_600_000,
      }),
    ]);
    assert.equal(clusters.length, 2);
    assert.notEqual(clusterOf(clusters, 10).id, clusterOf(clusters, 20).id);
  });

  it('time-adjacent same-host tabs with different topics stay split', () => {
    const clusters = buildTaskClusters([
      tab({
        id: 10,
        url: 'https://github.com/foo/react-hooks-guide',
        semanticLabel: 'React hooks 入门',
        createdAt: 10_000,
      }),
      tab({
        id: 20,
        url: 'https://github.com/foo/k8s-net',
        semanticLabel: 'Kubernetes 排错',
        createdAt: 12_000,
      }),
    ]);
    assert.equal(clusters.length, 2);
  });

  it('time-adjacent tabs with the same topic form one task', () => {
    const clusters = buildTaskClusters([
      tab({
        id: 10,
        url: 'https://react.dev/reference/useeffect',
        semanticLabel: 'React hooks 入门',
        createdAt: 10_000,
      }),
      tab({
        id: 20,
        url: 'https://github.com/foo/react-hooks-guide',
        semanticLabel: 'React hooks 入门',
        createdAt: 12_000,
      }),
    ]);
    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters[0].tabIds, [10, 20]);
    assert.ok(clusters[0].edges.time >= 1);
  });
});

describe('buildTaskClusters — referrer click-source', () => {
  it('unions a tab whose referrer matches another open URL', () => {
    const clusters = buildTaskClusters([
      tab({
        id: 1,
        url: 'https://news.example.com/story',
        semanticLabel: '新闻',
      }),
      tab({
        id: 2,
        url: 'https://other.test/detail',
        referrerUrl: 'https://news.example.com/story',
        semanticLabel: '百科条目',
      }),
    ]);
    assert.equal(clusters.length, 1);
    assert.ok(clusters[0].edges.referrer >= 1);
  });
});

describe('buildTaskClusters — learned priors', () => {
  it('unions future similar navigations after opener co-occurrence was learned', () => {
    let priors = emptyPriorStore();
    priors = bumpPrior(
      priors,
      'https://linear.app/acme/issue/ABC-1',
      'https://docs.acme.dev/oncall/runbook',
      { source: 'opener', delta: 0.2, now: 1 },
    );
    priors = bumpPrior(
      priors,
      'https://linear.app/acme/issue/ABC-9',
      'https://docs.acme.dev/oncall/runbook',
      { source: 'opener', delta: 0.2, now: 2 },
    );
    const clusters = buildTaskClusters(
      [
        tab({
          id: 5,
          url: 'https://linear.app/acme/issue/ABC-42',
          semanticLabel: '项目管理',
          createdAt: 9_000_000,
        }),
        tab({
          id: 6,
          url: 'https://docs.acme.dev/oncall/runbook',
          semanticLabel: '项目管理',
          createdAt: 9_900_000,
        }),
      ],
      { priors },
    );
    assert.equal(clusters.length, 1);
    assert.ok(clusters[0].edges.learned >= 1);
  });

  it('does not use hostname-only priors to glue different topics', () => {
    let priors = emptyPriorStore();
    // Attempt a shallow pair (should be rejected by bumpPrior)
    priors = bumpPrior(priors, 'https://github.com/', 'https://github.com/other', {
      source: 'opener',
      delta: 1,
      now: 1,
    });
    const clusters = buildTaskClusters(
      [
        tab({
          id: 1,
          url: 'https://github.com/a/b',
          semanticLabel: '主题甲',
          createdAt: 1,
        }),
        tab({
          id: 2,
          url: 'https://github.com/c/d',
          semanticLabel: '主题乙',
          createdAt: 2,
        }),
      ],
      { priors },
    );
    assert.equal(clusters.length, 2);
  });
});

describe('session feedback extension point', () => {
  it('merge forces two unrelated tabs into one task', () => {
    const session = recordSessionFeedback({ merges: [], splits: [] }, 'merge', [1, 2]);
    const clusters = buildTaskClusters(
      [
        tab({ id: 1, url: 'https://a.example/x', semanticLabel: '甲', createdAt: 1 }),
        tab({ id: 2, url: 'https://b.example/y', semanticLabel: '乙', createdAt: 9_000_000 }),
      ],
      { sessionMerges: session.merges },
    );
    assert.equal(clusters.length, 1);
    assert.ok(clusters[0].edges.feedback >= 1);
  });

  it('split blocks even an opener edge for this session', () => {
    const session = recordSessionFeedback({ merges: [], splits: [] }, 'split', [1, 2]);
    const clusters = buildTaskClusters(
      [
        tab({ id: 1, url: 'https://a.example/x/doc', semanticLabel: '甲' }),
        tab({
          id: 2,
          openerTabId: 1,
          url: 'https://b.example/y/doc',
          semanticLabel: '乙',
        }),
      ],
      { sessionSplits: session.splits },
    );
    assert.equal(clusters.length, 2);
  });
});

describe('majorityLabel', () => {
  it('picks the most common real topic, not domain leftovers', () => {
    assert.equal(
      majorityLabel([
        { semanticLabel: 'API 文档' },
        { semanticLabel: 'API 文档' },
        { semanticLabel: '未分类' },
      ]),
      'API 文档',
    );
  });
});
