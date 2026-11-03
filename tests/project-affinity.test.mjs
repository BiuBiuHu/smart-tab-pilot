/**
 * Project affinity — Bettr Promotion fixtures + anti-domain-aggregation.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalProductKeys,
  projectAffinityKeys,
  projectDisplayName,
  sharesProjectAffinity,
  slugsRelated,
  titleCaseSlug,
} from '../shared/project-affinity.js';
import { applyModelJudgment, proposeCandidatePairs } from '../shared/model-group-judge.js';
import { buildTabSummary } from '../shared/tab-summary.js';
import { buildTaskClusters } from '../shared/task-graph.js';

function tab(partial) {
  return {
    id: partial.id,
    windowId: partial.windowId ?? 1,
    openerTabId: partial.openerTabId ?? null,
    createdAt: partial.createdAt,
    url: partial.url,
    title: partial.title,
    semanticLabel: partial.semanticLabel,
    summary: partial.summary,
  };
}

/** Four URL shapes from user screenshots — one product, not four regex groups. */
const BETTR_FIXTURES = {
  unio: 'https://bettr-promotion-dev-unio.page.alipay.net/page/home',
  marmot: 'https://www.marmot-cloud.com/bettr/bettr-promotion/it/console',
  marketing: 'https://bettr-promotion-marketing-console-bhyapy0-de.example.com/login',
  acAlipay: 'https://ac.alipay.com/page/bettr-promotion/index.html',
};

describe('slugsRelated / titleCaseSlug', () => {
  it('relates bettr to bettr-promotion', () => {
    assert.equal(slugsRelated('bettr', 'bettr-promotion'), true);
    assert.equal(slugsRelated('bettr-promotion', 'bettr-promotion'), true);
    assert.equal(slugsRelated('k8s-net', 'react-hooks'), false);
  });
  it('title-cases product slugs', () => {
    assert.equal(titleCaseSlug('bettr-promotion'), 'Bettr Promotion');
  });
});

describe('sharesProjectAffinity — Bettr-like URLs', () => {
  const marmot = 'https://www.marmot-cloud.com/bettr/bettr-promotion/it/console';
  const marketing =
    'https://bettr-promotion-marketing-console-bhyapy0-de.example.com/login';
  const alipay = 'https://bettr-promotion-dev-unio.page.alipay.net/page/home';
  const localA = 'https://127.0.0.1:8787/rights-demo';
  const localB = 'https://127.0.0.1:8787/campaign-demo';
  const localC = 'https://127.0.0.1:8787/batch-reward';
  const localD = 'https://127.0.0.1:8787/';

  it('links marmot path, marketing console host, and alipay unio host', () => {
    assert.ok(sharesProjectAffinity(marmot, marketing));
    assert.ok(sharesProjectAffinity(marmot, alipay));
    assert.ok(sharesProjectAffinity(marketing, alipay));
    assert.ok(projectAffinityKeys(marmot).slugs.includes('bettr-promotion'));
    assert.ok(projectAffinityKeys(alipay).slugs.includes('bettr-promotion'));
  });

  it('treats same-port localhost as one local app', () => {
    assert.ok(sharesProjectAffinity(localA, localB));
    assert.ok(sharesProjectAffinity(localA, localD));
    assert.ok(sharesProjectAffinity(localA, 'http://localhost:8787/other'));
    assert.equal(sharesProjectAffinity(localA, 'https://127.0.0.1:3000/other'), false);
  });

  it('does not merge bare hostname / different products', () => {
    assert.equal(
      sharesProjectAffinity(
        'https://github.com/foo/react-hooks-guide',
        'https://github.com/foo/k8s-net',
      ),
      false,
    );
    assert.equal(
      sharesProjectAffinity(
        'https://github.com/facebook/react',
        'https://github.com/facebook/react-native',
      ),
      false,
    );
    assert.equal(
      sharesProjectAffinity('https://example.com/a', 'https://example.com/b'),
      false,
    );
    assert.equal(
      sharesProjectAffinity(
        'https://www.marmot-cloud.com/other-suite/dashboard',
        marmot,
      ),
      false,
    );
    assert.equal(
      sharesProjectAffinity(
        'https://linear.app/acme/issue/ABC-1',
        'https://linear.app/acme/issue/ABC-2',
      ),
      false,
    );
  });

  it('merges same-repo prefix (origin + two path segments)', () => {
    assert.ok(
      sharesProjectAffinity(
        'https://github.com/acme/app/issues/1',
        'https://github.com/acme/app/pull/2',
      ),
    );
  });
});

describe('canonical product key — four screenshot URL shapes', () => {
  it('maps Unio / Marmot / Marketing / ac.alipay to bettr-promotion only', () => {
    for (const [name, url] of Object.entries(BETTR_FIXTURES)) {
      const keys = canonicalProductKeys(url);
      assert.ok(keys.includes('bettr-promotion'), `${name} keys=${keys}`);
      assert.ok(!keys.some((k) => /unio|marketing|console/i.test(k)), `${name} leaked env: ${keys}`);
    }
  });

  it('does not regex-union the four shapes (slug is not authority)', () => {
    const nodes = [
      tab({
        id: 1,
        windowId: 3,
        url: BETTR_FIXTURES.unio,
        title: 'bettr-promotion-dev-unio',
        semanticLabel: 'Unio',
        summary: buildTabSummary({ title: 'Unio 控制台', url: BETTR_FIXTURES.unio }),
      }),
      tab({
        id: 2,
        windowId: 3,
        url: BETTR_FIXTURES.marmot,
        title: 'bettr-promotion · Marmot',
        semanticLabel: 'Marmot',
        summary: buildTabSummary({ title: 'Marmot 控制台', url: BETTR_FIXTURES.marmot }),
      }),
      tab({
        id: 3,
        windowId: 5,
        url: BETTR_FIXTURES.marketing,
        title: '登录态异常',
        semanticLabel: '登录态异常',
        summary: buildTabSummary({ title: '营销台登录', url: BETTR_FIXTURES.marketing }),
      }),
      tab({
        id: 4,
        windowId: 5,
        url: BETTR_FIXTURES.acAlipay,
        title: 'bettr-promotion',
        semanticLabel: '支付宝页',
        summary: buildTabSummary({ title: 'Bettr 投放页', url: BETTR_FIXTURES.acAlipay }),
      }),
    ];
    const first = buildTaskClusters(nodes);
    assert.equal(first.length, 4, 'regex must not hard-merge');
    assert.ok(first.every((c) => !/unio|marketing/i.test(c.label)));

    const summaries = new Map(nodes.map((n) => [n.id, n.summary]));
    const candidates = proposeCandidatePairs(first, summaries);
    assert.ok(candidates.length >= 3);
    assert.ok(candidates.every((p) => p.productKey === 'bettr-promotion' || p.productKey === 'bettr'));

    const merged = applyModelJudgment(
      nodes,
      first,
      { merges: [[1, 2], [2, 3], [3, 4]] },
      {},
      buildTaskClusters,
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].label, 'Bettr Promotion');
    assert.deepEqual(merged[0].tabIds, [1, 2, 3, 4]);
    assert.ok(merged[0].windowIds.includes(3));
    assert.ok(merged[0].windowIds.includes(5));
    assert.ok(merged[0].edges.model >= 1);
  });

  it('localhost demos stay split without opener/time/model/feedback', () => {
    const clusters = buildTaskClusters([
      tab({
        id: 1,
        url: 'https://127.0.0.1:8787/rights',
        title: '创建权益demo',
        semanticLabel: '创建权益demo',
        createdAt: 1,
      }),
      tab({
        id: 2,
        url: 'https://127.0.0.1:8787/campaign',
        title: '活动管理demo',
        semanticLabel: '活动管理demo',
        createdAt: 9_000_000,
      }),
    ]);
    assert.equal(clusters.length, 2);
  });
});

describe('buildTaskClusters — no regex product authority', () => {
  it('keeps same-domain different products split', () => {
    const clusters = buildTaskClusters([
      tab({
        id: 1,
        url: 'https://github.com/foo/react-hooks-guide',
        semanticLabel: 'React hooks 入门',
      }),
      tab({
        id: 2,
        url: 'https://github.com/foo/k8s-net',
        semanticLabel: 'Kubernetes 排错',
      }),
    ]);
    assert.equal(clusters.length, 2);
  });

  it('honors session split over a model merge', () => {
    const clusters = buildTaskClusters(
      [
        tab({ id: 1, url: BETTR_FIXTURES.marmot, semanticLabel: '甲' }),
        tab({ id: 2, url: BETTR_FIXTURES.unio, semanticLabel: '乙' }),
      ],
      { sessionSplits: [[1, 2]], extraUnions: [[1, 2]] },
    );
    assert.equal(clusters.length, 2);
  });
});

describe('projectDisplayName', () => {
  it('is Bettr Promotion — never Unio or Marketing', () => {
    assert.equal(
      projectDisplayName([
        { url: BETTR_FIXTURES.marmot },
        { url: BETTR_FIXTURES.unio },
        { url: BETTR_FIXTURES.marketing },
        { url: BETTR_FIXTURES.acAlipay },
      ]),
      'Bettr Promotion',
    );
    assert.equal(projectDisplayName([{ url: BETTR_FIXTURES.unio }]), 'Bettr Promotion');
    assert.equal(projectDisplayName([{ url: BETTR_FIXTURES.marketing }]), 'Bettr Promotion');
  });
});
