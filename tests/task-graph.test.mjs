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

describe('buildTaskClusters — opener/referrer are hints, not hard merges', () => {
  it('does not hard-merge an opener chain of different-class pages', () => {
    const nodes = [
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
    ];
    const clusters = buildTaskClusters(nodes);
    assert.equal(clusters.length, 3);
    assert.equal(clusterOf(clusters, 1).tabIds.length, 1);
    assert.equal(clusterOf(clusters, 2).tabIds.length, 1);
    assert.equal(clusterOf(clusters, 3).tabIds.length, 1);
    const cands = collectRuleCandidates(nodes);
    assert.ok(cands.some((p) => p.kind === 'opener' && p.a === 1 && p.b === 2));
    assert.ok(cands.some((p) => p.kind === 'opener' && p.a === 2 && p.b === 3));
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
  it('treats a matching referrer as a candidate, not a conservative union', () => {
    const nodes = [
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
    ];
    const clusters = buildTaskClusters(nodes);
    assert.equal(clusters.length, 2);
    const cands = collectRuleCandidates(nodes);
    assert.ok(cands.some((p) => p.kind === 'referrer' && p.a === 1 && p.b === 2));
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

describe('product-path related tabs cluster by distinctive identity', () => {
  const unio = 'https://bettr-promotion-dev-unio.page.alipay.net/page/home';
  const marmot = 'https://www.marmot-cloud.com/bettr/bettr-promotion/it/console';
  const marketing = 'https://bettr-promotion-marketing-console.example.com/login';

  it('shared product identity unions without a model; time is still a candidate', () => {
    const nodes = [
      tab({
        id: 1,
        windowId: 1,
        url: unio,
        title: 'bettr-promotion-dev-unio',
        semanticLabel: 'Unio',
        createdAt: 1,
      }),
      tab({
        id: 2,
        windowId: 1,
        url: marmot,
        title: 'bettr-promotion · Marmot',
        semanticLabel: 'Marmot',
        createdAt: 8_000,
      }),
      tab({
        id: 3,
        windowId: 2,
        url: marketing,
        title: 'bettr-promotion marketing console',
        semanticLabel: '登录',
        createdAt: 9_000_000,
      }),
    ];
    const first = buildTaskClusters(nodes);
    assert.equal(first.length, 1);
    assert.deepEqual(first[0].tabIds, [1, 2, 3]);
    assert.ok(first[0].edges.project >= 1);
    const kinds = new Set(collectRuleCandidates(nodes).map((p) => p.kind));
    assert.ok(kinds.has('project'));
    assert.ok(kinds.has('time'), 'nearby same-window product tabs are time candidates');
  });

  it('model extraUnions still join rule-split same-class clusters', () => {
    const nodes = [
      tab({
        id: 1,
        windowId: 1,
        url: marmot,
        title: 'bettr-promotion · Marmot',
        semanticLabel: 'Bettr Promotion',
      }),
      tab({
        id: 2,
        windowId: 3,
        url: 'https://yuque.antfin.com/ot2rzd/tech/bettr-plan',
        title: 'BETTR信贷智能增长平台一期技术方案',
        semanticLabel: '批量发奖demo',
      }),
    ];
    const first = buildTaskClusters(nodes);
    assert.equal(first.length, 2, 'docs vs runtime stay split until the model speaks');
    const merged = applyModelJudgment(
      nodes,
      first,
      { merges: [[1, 2]] },
      {},
      buildTaskClusters,
    );
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].tabIds, [1, 2]);
    assert.ok(merged[0].edges.model >= 1);
  });
});

describe('independently opened same-product tabs cluster without navigation', () => {
  const t0 = 1_800_000_000_000;

  function repoAndSite(product, { withNav = false } = {}) {
    return [
      tab({
        id: 31,
        windowId: 1,
        url: `https://github.com/acme/${product}`,
        title: `acme/${product}: Open source personal agent for local workflows`,
        semanticLabel: `${product} 仓库`,
        createdAt: t0,
      }),
      tab({
        id: 32,
        windowId: 1,
        url: `https://${product}.example.dev/`,
        title: `${product[0].toUpperCase()}${product.slice(1)} - Your personal agent`,
        semanticLabel: `${product} 官网`,
        createdAt: t0 + 120_000,
        openerTabId: withNav ? 31 : null,
        openerFromNavigation: withNav ? true : undefined,
      }),
    ];
  }

  it('GitHub repo + official site sharing a distinctive name cluster without extraUnions', () => {
    for (const product of ['zed', 'riverkit']) {
      const nodes = repoAndSite(product);
      const clusters = buildTaskClusters(nodes);
      assert.equal(clusters.length, 1, `${product} should be one task without a model`);
      assert.deepEqual(clusters[0].tabIds, [31, 32]);
      assert.equal(clusters[0].edges.opener, 0);
      assert.equal(clusters[0].edges.referrer, 0);
      assert.ok(clusters[0].edges.project >= 1);
      const cands = collectRuleCandidates(nodes);
      assert.ok(cands.some((p) => p.kind === 'project' && p.a === 31 && p.b === 32));
    }
  });

  it('the same pair still clusters when extraUnions repeats the merge', () => {
    const nodes = repoAndSite('zed');
    const first = buildTaskClusters(nodes);
    const merged = applyModelJudgment(
      nodes,
      first,
      { merges: [[31, 32]] },
      {},
      buildTaskClusters,
    );
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].tabIds, [31, 32]);
  });

  it('unrelated independently opened tabs stay separate even with nearby createdAt and weak opener', () => {
    const nodes = [
      ...repoAndSite('zed'),
      tab({
        id: 41,
        windowId: 1,
        openerTabId: 31,
        openerFromNavigation: false,
        birthUrl: 'chrome://newtab/',
        url: 'https://licenses.example.org/by/4.0/',
        title: 'License deed',
        semanticLabel: '许可协议',
        createdAt: t0 + 4_000,
      }),
      tab({
        id: 42,
        windowId: 1,
        openerTabId: 31,
        openerFromNavigation: false,
        url: 'https://ops.corp.example.net/env/5987128',
        title: 'Env dashboard',
        semanticLabel: '环境面板',
        createdAt: t0 + 9_000,
      }),
      tab({
        id: 43,
        windowId: 1,
        url: 'https://github.com/acme/other-app',
        title: 'acme/other-app: A different product',
        semanticLabel: '另一个产品',
        createdAt: t0 + 11_000,
      }),
    ];
    const clusters = buildTaskClusters(nodes);
    const product = clusterOf(clusters, 31);
    assert.ok(product.tabIds.includes(32));
    assert.equal(product.tabIds.includes(41), false);
    assert.equal(product.tabIds.includes(42), false);
    assert.equal(product.tabIds.includes(43), false);
    assert.equal(clusterOf(clusters, 41).tabIds.length, 1);
    assert.equal(clusterOf(clusters, 42).tabIds.length, 1);
    assert.equal(clusterOf(clusters, 43).tabIds.length, 1);
  });

  it('true click opener still clusters a same-product navigation chain via content/class', () => {
    const nodes = repoAndSite('zed', { withNav: true });
    const clusters = buildTaskClusters(nodes);
    assert.equal(clusters.length, 1);
    assert.ok(clusters[0].edges.project >= 1);
    assert.equal(clusters[0].edges.opener, 0, 'opener is a hint, not a conservative union');
    const cands = collectRuleCandidates(nodes);
    assert.ok(cands.some((p) => p.kind === 'opener' && p.a === 31 && p.b === 32));
  });

  it('true referrer without product identity stays split (candidate only)', () => {
    const nodes = [
      tab({
        id: 1,
        url: 'https://news.example.com/story',
        title: 'A news story',
        semanticLabel: '新闻',
      }),
      tab({
        id: 2,
        url: 'https://other.test/detail',
        title: 'Unrelated detail',
        referrerUrl: 'https://news.example.com/story',
        semanticLabel: '百科条目',
      }),
    ];
    const clusters = buildTaskClusters(nodes);
    assert.equal(clusters.length, 2);
    const cands = collectRuleCandidates(nodes);
    assert.ok(cands.some((p) => p.kind === 'referrer' && p.a === 1 && p.b === 2));
  });
});

/**
 * Screenshot blob: a local proxy, three work docs, and a different-port
 * localhost app were chained by reliable opener and named 「本地应用」.
 * Content/class must win; opener must not glue different products together.
 */
describe('mixed opener chain across local apps and work docs', () => {
  const t0 = 2_100_000_000_000;
  const proxy = tab({
    id: 1,
    windowId: 1,
    url: 'http://127.0.0.1:8787/',
    title: 'Claude Model Proxy',
    semanticLabel: 'Claude Model Proxy',
    createdAt: t0,
  });
  const yuqueA = tab({
    id: 2,
    windowId: 1,
    openerTabId: 1,
    openerFromNavigation: true,
    url: 'https://docs.example.net/team-a/plan/workload-split',
    title: '二期工作量拆解',
    semanticLabel: '二期工作量拆解',
    createdAt: t0 + 5_000,
  });
  const yuqueB = tab({
    id: 3,
    windowId: 1,
    openerTabId: 2,
    openerFromNavigation: true,
    url: 'https://docs.example.net/team-b/book/notify-module',
    title: '通知模块',
    semanticLabel: '通知模块',
    createdAt: t0 + 8_000,
  });
  const yuqueC = tab({
    id: 4,
    windowId: 1,
    openerTabId: 3,
    openerFromNavigation: true,
    url: 'https://docs.example.net/team-b/book/event-center',
    title: '事件中心',
    semanticLabel: '事件中心',
    createdAt: t0 + 11_000,
  });
  const localNod = tab({
    id: 5,
    windowId: 1,
    openerTabId: 4,
    openerFromNavigation: true,
    url: 'http://localhost:4310/',
    title: 'Nod',
    semanticLabel: 'Nod',
    createdAt: t0 + 20_000,
  });
  const nodSite = tab({
    id: 6,
    windowId: 2,
    url: 'https://nod.example.dev/',
    title: 'Nod - Your personal agent',
    semanticLabel: 'Nod 官网',
    createdAt: t0 + 120_000,
  });
  const nodRepo = tab({
    id: 7,
    windowId: 2,
    url: 'https://github.com/acme/nod',
    title: 'acme/nod: Open source personal agent for local workflows',
    semanticLabel: 'Nod 仓库',
    createdAt: t0 + 180_000,
  });

  function mixedNodes() {
    return [proxy, yuqueA, yuqueB, yuqueC, localNod, nodSite, nodRepo];
  }

  it('does not hard-merge proxy, work docs, and a different-port local app via opener', () => {
    const nodes = mixedNodes();
    const clusters = buildTaskClusters(nodes);
    assert.notEqual(
      clusterOf(clusters, 1).id,
      clusterOf(clusters, 5).id,
      'different localhost ports are different products',
    );
    assert.equal(clusterOf(clusters, 1).tabIds.includes(2), false);
    assert.equal(clusterOf(clusters, 1).tabIds.includes(5), false);
    for (const docId of [2, 3, 4]) {
      assert.equal(clusterOf(clusters, 1).tabIds.includes(docId), false);
      assert.equal(clusterOf(clusters, 5).tabIds.includes(docId), false);
    }
    assert.equal(
      clusters.some((c) => c.label === '本地应用' && c.tabIds.length > 1),
      false,
      'a mixed blob must not inherit the generic localhost bucket name',
    );
    const cands = collectRuleCandidates(nodes);
    assert.ok(cands.some((p) => p.kind === 'opener' && p.a === 1 && p.b === 2));
    assert.ok(cands.some((p) => p.kind === 'opener' && p.a === 4 && p.b === 5));
  });

  it('groups related work docs by project path; model may join the remaining doc', () => {
    const nodes = mixedNodes();
    const first = buildTaskClusters(nodes);
    assert.equal(clusterOf(first, 3).id, clusterOf(first, 4).id, 'same book path is one class');
    assert.notEqual(
      clusterOf(first, 2).id,
      clusterOf(first, 3).id,
      'a different docs space stays split until the model speaks',
    );
    const joined = applyModelJudgment(
      nodes,
      first,
      { merges: [[2, 3]] },
      {},
      buildTaskClusters,
    );
    assert.equal(clusterOf(joined, 2).id, clusterOf(joined, 3).id);
    assert.equal(clusterOf(joined, 2).id, clusterOf(joined, 4).id);
    assert.equal(clusterOf(joined, 2).tabIds.includes(1), false);
    assert.equal(clusterOf(joined, 2).tabIds.includes(5), false);
  });

  it('lets the localhost app join its official site and GitHub repo', () => {
    const clusters = buildTaskClusters(mixedNodes());
    const nod = clusterOf(clusters, 5);
    assert.ok(nod.tabIds.includes(6), 'official site');
    assert.ok(nod.tabIds.includes(7), 'GitHub repo');
    assert.equal(nod.tabIds.includes(1), false);
    assert.equal(nod.label === '本地应用', false);
  });

  it('does not persist model unions as session merges; a later pass can revise', () => {
    const nodes = mixedNodes();
    const first = buildTaskClusters(nodes);
    const merged = applyModelJudgment(
      nodes,
      first,
      { merges: [[1, 2], [2, 5]] },
      {},
      buildTaskClusters,
    );
    assert.ok(clusterOf(merged, 1).tabIds.includes(2));
    assert.ok(clusterOf(merged, 1).tabIds.includes(5));

    const revised = buildTaskClusters(nodes);
    assert.equal(clusterOf(revised, 1).tabIds.includes(2), false);
    assert.equal(clusterOf(revised, 1).tabIds.includes(5), false);

    const session = recordSessionFeedback({ merges: [], splits: [] }, 'merge', [1, 2]);
    const forced = buildTaskClusters(nodes, { sessionMerges: session.merges });
    assert.ok(clusterOf(forced, 1).tabIds.includes(2));
    assert.ok(clusterOf(forced, 1).edges.feedback >= 1);
  });

  it('screenshot-shaped URLs follow the same content/class rules (not a host blocklist)', () => {
    const nodes = [
      tab({
        id: 11,
        url: 'http://127.0.0.1:8787/',
        title: 'Claude Model Proxy',
        semanticLabel: 'Claude Model Proxy',
        openerFromNavigation: true,
      }),
      tab({
        id: 12,
        openerTabId: 11,
        openerFromNavigation: true,
        url: 'https://yuque.antfin.com/ut4tfg/vxlotz/sadixn77owe2zsav',
        title: '二期工作量拆解',
        semanticLabel: '二期工作量拆解',
      }),
      tab({
        id: 13,
        openerTabId: 12,
        openerFromNavigation: true,
        url: 'https://yuque.antfin.com/ot2rzd/scbe7o/gk3suqp8zbmmypzf',
        title: '通知模块',
        semanticLabel: '通知模块',
      }),
      tab({
        id: 14,
        openerTabId: 13,
        openerFromNavigation: true,
        url: 'https://yuque.antfin.com/ot2rzd/scbe7o/rsrgy9z2bn8gdw36',
        title: '事件中心',
        semanticLabel: '事件中心',
      }),
      tab({
        id: 15,
        openerTabId: 14,
        openerFromNavigation: true,
        url: 'http://localhost:4310/',
        title: 'Nod',
        semanticLabel: 'Nod',
      }),
      tab({
        id: 16,
        url: 'https://nod.n8n.io/',
        title: 'Nod - Your personal agent',
        semanticLabel: 'Nod 官网',
      }),
      tab({
        id: 17,
        url: 'https://github.com/n8n-io/nod',
        title: 'n8n-io/nod: Open source personal agent',
        semanticLabel: 'Nod 仓库',
      }),
    ];
    const clusters = buildTaskClusters(nodes);
    assert.equal(clusterOf(clusters, 11).tabIds.includes(12), false);
    assert.equal(clusterOf(clusters, 11).tabIds.includes(15), false);
    assert.equal(clusterOf(clusters, 13).id, clusterOf(clusters, 14).id);
    const nod = clusterOf(clusters, 15);
    assert.ok(nod.tabIds.includes(16));
    assert.ok(nod.tabIds.includes(17));
    assert.equal(nod.label === '本地应用', false);
    assert.equal(
      clusters.some((c) => c.label === '本地应用' && c.tabIds.some((id) => id !== 11)),
      false,
    );
  });
});
