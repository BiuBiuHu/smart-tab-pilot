/**
 * 任务导航图 unit tests (pure clustering, no Chrome APIs).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyPriorStore, bumpPrior } from '../shared/nav-priors.js';
import { applyModelJudgment } from '../shared/model-group-judge.js';
import {
  buildTaskClusters,
  collectRuleCandidates,
  isReliableOpener,
  labelsCompatible,
  majorityLabel,
  recordSessionFeedback,
} from '../shared/task-graph.js';

function tab(partial) {
  return {
    id: partial.id,
    windowId: partial.windowId ?? 1,
    openerTabId: partial.openerTabId ?? null,
    openerFromNavigation: partial.openerFromNavigation,
    birthUrl: partial.birthUrl,
    pendingUrl: partial.pendingUrl,
    createdAt: partial.createdAt,
    url: partial.url,
    title: partial.title,
    referrerUrl: partial.referrerUrl,
    semanticLabel: partial.semanticLabel,
    summary: partial.summary,
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
        openerFromNavigation: true,
        url: 'https://stackoverflow.com/q/123',
        semanticLabel: '排错问答',
        createdAt: 1500,
      }),
      tab({
        id: 3,
        openerTabId: 2,
        openerFromNavigation: true,
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

  it('time-adjacent tabs with the same topic stay split without a model', () => {
    const nodes = [
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
    ];
    const clusters = buildTaskClusters(nodes);
    assert.equal(clusters.length, 2);
    const cands = collectRuleCandidates(nodes);
    assert.ok(cands.some((p) => p.kind === 'time' && p.a === 10 && p.b === 20));
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
  it('learned co-occurrence is a candidate, not a conservative hard-merge', () => {
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
    const nodes = [
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
    ];
    const clusters = buildTaskClusters(nodes, { priors });
    assert.equal(clusters.length, 2, 'learned priors must not hard-merge');
    const cands = collectRuleCandidates(nodes, { priors });
    assert.ok(cands.some((p) => p.kind === 'learned' && p.a === 5 && p.b === 6));
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
          openerFromNavigation: true,
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

describe('isReliableOpener', () => {
  it('requires an openerTabId and navigation evidence', () => {
    assert.equal(isReliableOpener(tab({ id: 1, url: 'https://a.example/x' })), false);
    assert.equal(
      isReliableOpener(tab({ id: 2, openerTabId: 1, url: 'https://b.example/y' })),
      false,
    );
    assert.equal(
      isReliableOpener(
        tab({ id: 2, openerTabId: 1, openerFromNavigation: true, url: 'https://b.example/y' }),
      ),
      true,
    );
    assert.equal(
      isReliableOpener(
        tab({
          id: 2,
          openerTabId: 1,
          openerFromNavigation: false,
          birthUrl: 'chrome://newtab/',
          url: 'https://licenses.example.org/by/4.0/',
        }),
      ),
      false,
    );
    assert.equal(
      isReliableOpener(
        tab({
          id: 2,
          openerTabId: 1,
          birthUrl: 'https://docs.example.com/auth',
          url: 'https://docs.example.com/auth',
        }),
      ),
      true,
    );
  });
});

describe('independently opened same-window tabs stay separate', () => {
  const t0 = 1_700_000_000_000;

  it('does not hard-merge unrelated tabs that share a window, nearby open time, and Chrome tab-strip opener', () => {
    const nodes = [
      tab({
        id: 1,
        windowId: 1,
        url: 'https://console.example-product.net/home',
        title: 'Product console',
        semanticLabel: '营销控制台',
        createdAt: t0,
      }),
      tab({
        id: 2,
        windowId: 1,
        openerTabId: 1,
        openerFromNavigation: false,
        birthUrl: 'chrome://newtab/',
        url: 'https://chat.example.com/c/abc',
        title: 'Draft a blog outline',
        semanticLabel: '写作',
        createdAt: t0 + 4_000,
      }),
      tab({
        id: 3,
        windowId: 1,
        openerTabId: 1,
        openerFromNavigation: false,
        birthUrl: '',
        url: 'https://calendar.example.org/today',
        title: 'Calendar',
        semanticLabel: '日历',
        createdAt: t0 + 9_000,
      }),
      tab({
        id: 4,
        windowId: 1,
        openerTabId: 2,
        openerFromNavigation: false,
        url: 'https://127.0.0.1:8899/network',
        title: 'Local debugger',
        semanticLabel: '本地调试',
        createdAt: t0 + 14_000,
      }),
      tab({
        id: 5,
        windowId: 1,
        openerTabId: 1,
        openerFromNavigation: false,
        url: 'https://licenses.example.org/by/4.0/',
        title: 'License deed',
        semanticLabel: '许可协议',
        createdAt: t0 + 20_000,
      }),
      tab({
        id: 6,
        windowId: 1,
        openerTabId: 1,
        openerFromNavigation: false,
        url: 'https://ops.corp.example.net/env/5987128',
        title: 'Env dashboard',
        semanticLabel: '环境面板',
        createdAt: t0 + 28_000,
      }),
    ];
    const clusters = buildTaskClusters(nodes);
    assert.equal(clusters.length, 6);
    for (const n of nodes) {
      assert.equal(clusterOf(clusters, n.id).tabIds.length, 1);
    }
    assert.equal(clusters.every((c) => c.edges.opener === 0 && c.edges.time === 0), true);

    const cands = collectRuleCandidates(nodes);
    assert.ok(cands.some((p) => p.kind === 'opener-weak'));
    assert.ok(cands.some((p) => p.kind === 'time'));
    assert.equal(
      cands.some((p) => p.kind === 'opener'),
      false,
      'tab-strip opener must not be advertised as a true navigation opener',
    );
  });

  it('same Chrome window alone never unions two unrelated tabs', () => {
    const clusters = buildTaskClusters([
      tab({ id: 1, windowId: 7, url: 'https://a.example/x', semanticLabel: '甲' }),
      tab({ id: 2, windowId: 7, url: 'https://b.example/y', semanticLabel: '乙' }),
    ]);
    assert.equal(clusters.length, 2);
  });

  it('unclassified labels plus open-time adjacency still stay split', () => {
    const clusters = buildTaskClusters([
      tab({
        id: 1,
        windowId: 1,
        url: 'https://product.example.net/app',
        semanticLabel: '未分类',
        createdAt: 50_000,
      }),
      tab({
        id: 2,
        windowId: 1,
        url: 'https://notes.example.org/scratch',
        semanticLabel: '',
        createdAt: 51_000,
      }),
    ]);
    assert.equal(clusters.length, 2);
  });
});

describe('product-path related tabs can still cluster via the model', () => {
  const unio = 'https://bettr-promotion-dev-unio.page.alipay.net/page/home';
  const marmot = 'https://www.marmot-cloud.com/bettr/bettr-promotion/it/console';
  const marketing = 'https://bettr-promotion-marketing-console.example.com/login';

  it('project path is a candidate but not a conservative union', () => {
    const nodes = [
      tab({ id: 1, windowId: 1, url: unio, semanticLabel: 'Unio', createdAt: 1 }),
      tab({ id: 2, windowId: 1, url: marmot, semanticLabel: 'Marmot', createdAt: 8_000 }),
      tab({ id: 3, windowId: 2, url: marketing, semanticLabel: '登录', createdAt: 9_000_000 }),
    ];
    const first = buildTaskClusters(nodes);
    assert.equal(first.length, 3);
    const kinds = new Set(collectRuleCandidates(nodes).map((p) => p.kind));
    assert.ok(kinds.has('project'));
    assert.ok(kinds.has('time'), 'nearby same-window product tabs are time candidates');
  });

  it('model extraUnions still join the same product across hosts/windows', () => {
    const nodes = [
      tab({ id: 1, windowId: 1, url: unio, title: 'Unio', semanticLabel: 'Unio' }),
      tab({ id: 2, windowId: 3, url: marmot, title: 'Marmot', semanticLabel: 'Marmot' }),
      tab({ id: 3, windowId: 3, url: marketing, title: 'Marketing', semanticLabel: '登录' }),
    ];
    const first = buildTaskClusters(nodes);
    const merged = applyModelJudgment(
      nodes,
      first,
      { merges: [[1, 2], [2, 3]] },
      {},
      buildTaskClusters,
    );
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].tabIds, [1, 2, 3]);
    assert.equal(merged[0].label, 'Bettr Promotion');
    assert.ok(merged[0].edges.model >= 1);
  });
});
