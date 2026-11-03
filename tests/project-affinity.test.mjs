/**
 * Project affinity — Bettr Promotion fixtures + anti-domain-aggregation.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  projectAffinityKeys,
  projectDisplayName,
  sharesProjectAffinity,
  slugsRelated,
  titleCaseSlug,
} from '../shared/project-affinity.js';
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
  };
}

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

describe('buildTaskClusters — project affinity over titles', () => {
  it('merges localhost Bettr demos despite different heuristic titles', () => {
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
      tab({
        id: 3,
        url: 'https://127.0.0.1:8787/batch',
        title: '批量发奖demo',
        semanticLabel: '批量发奖demo',
        createdAt: 18_000_000,
      }),
      tab({
        id: 4,
        url: 'https://127.0.0.1:8787/',
        title: 'BETTR信贷智能增长平台',
        semanticLabel: 'BETTR信贷智能增长平台',
        createdAt: 27_000_000,
      }),
    ]);
    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters[0].tabIds, [1, 2, 3, 4]);
    assert.ok(clusters[0].edges.project >= 3);
    assert.match(clusters[0].label, /Bettr|本地应用/);
  });

  it('merges Bettr Promotion hosts across windows into one named group', () => {
    const clusters = buildTaskClusters([
      tab({
        id: 10,
        windowId: 3,
        url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/it/x',
        title: 'bettr-promotion · Marmot',
        semanticLabel: 'bettr',
      }),
      tab({
        id: 11,
        windowId: 3,
        url: 'https://bettr-promotion-marketing-console-bhyapy0-de.example.com/',
        title: '登录态异常',
        semanticLabel: '登录态异常',
      }),
      tab({
        id: 12,
        windowId: 5,
        url: 'https://bettr-promotion-dev-unio.page.alipay.net/page/b',
        title: 'bettr-promotion-dev-unio',
        semanticLabel: 'bettr',
      }),
    ]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].label, 'Bettr Promotion');
    assert.ok(clusters[0].windowIds.includes(3));
    assert.ok(clusters[0].windowIds.includes(5));
  });

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

  it('honors session split over project affinity', () => {
    const clusters = buildTaskClusters(
      [
        tab({ id: 1, url: 'https://127.0.0.1:8787/a', semanticLabel: '甲' }),
        tab({ id: 2, url: 'https://127.0.0.1:8787/b', semanticLabel: '乙' }),
      ],
      { sessionSplits: [[1, 2]] },
    );
    assert.equal(clusters.length, 2);
  });

  it('keeps transitive project affinity together despite mixed titles', () => {
    const clusters = buildTaskClusters([
      tab({
        id: 1,
        url: 'https://127.0.0.1:8787/rights',
        semanticLabel: '创建权益demo',
      }),
      tab({
        id: 2,
        url: 'https://127.0.0.1:8787/bettr-promotion',
        semanticLabel: '未分类',
      }),
      tab({
        id: 3,
        windowId: 2,
        url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/it',
        semanticLabel: '登录态异常',
      }),
    ]);
    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters[0].tabIds, [1, 2, 3]);
    assert.match(clusters[0].label, /Bettr Promotion/);
  });
});

describe('projectDisplayName', () => {
  it('prefers Bettr Promotion over page titles', () => {
    assert.equal(
      projectDisplayName([
        { url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/it' },
        { url: 'https://bettr-promotion-dev-unio.page.alipay.net/x' },
      ]),
      'Bettr Promotion',
    );
  });
});
