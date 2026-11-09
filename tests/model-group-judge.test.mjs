/**
 * Model same-group hook — second layer after rules, summaries only.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAME_GROUP_SYSTEM_PROMPT } from '../shared/constants.js';
import {
  applyModelJudgment,
  buildJudgePayload,
  formatJudgeUserPrompt,
  lexicalHintTokens,
  parseJudgeResponse,
  proposeCandidatePairs,
} from '../shared/model-group-judge.js';
import { buildTabSummary } from '../shared/tab-summary.js';
import { buildTaskClusters, recordSessionFeedback } from '../shared/task-graph.js';

function tab(partial) {
  return {
    id: partial.id,
    windowId: partial.windowId ?? 1,
    url: partial.url,
    title: partial.title,
    semanticLabel: partial.semanticLabel,
    summary: partial.summary,
    referrerUrl: partial.referrerUrl,
    openerTabId: partial.openerTabId,
    openerFromNavigation: partial.openerFromNavigation,
    createdAt: partial.createdAt,
  };
}

describe('parseJudgeResponse', () => {
  it('reads merges and ignores junk', () => {
    const j = parseJudgeResponse('```json\n{"merges":[[2,1],[2,1],[9]]}\n```');
    assert.deepEqual(j.merges, [[1, 2]]);
  });

  it('returns empty on malformed text', () => {
    assert.deepEqual(parseJudgeResponse('not json'), { merges: [] });
  });
});

describe('buildJudgePayload / applyModelJudgment', () => {
  it('exposes summaries not full bodies', () => {
    const nodes = [
      tab({
        id: 1,
        url: 'https://www.marmot-cloud.com/other/a',
        semanticLabel: '甲',
        summary: buildTabSummary({
          title: '甲',
          url: 'https://www.marmot-cloud.com/other/a',
          text: '第一句。第二句。' + 'BODY'.repeat(200),
        }),
      }),
      tab({
        id: 2,
        url: 'https://docs.example.com/b',
        semanticLabel: '乙',
        summary: buildTabSummary({
          title: '乙',
          url: 'https://docs.example.com/b',
          text: '另一页说明。',
        }),
      }),
    ];
    const clusters = buildTaskClusters(nodes);
    assert.equal(clusters.length, 2);
    const payload = buildJudgePayload(
      clusters,
      new Map(nodes.map((n) => [n.id, n.summary])),
    );
    const raw = JSON.stringify(payload);
    assert.ok(!raw.includes('BODY'.repeat(80)));
    assert.ok((payload.clusters[0].summaries[0].intro || '').length <= 280);
    const prompt = formatJudgeUserPrompt(payload);
    assert.match(prompt, /tab 1/);
    assert.match(prompt, /title:/);
    assert.match(prompt, /url:/);
    assert.ok(prompt.length < 4000);
  });

  it('applies model merges as a second layer without dropping project rules', () => {
    const nodes = [
      tab({
        id: 1,
        url: 'https://news.example.com/story',
        semanticLabel: '新闻',
      }),
      tab({
        id: 2,
        url: 'https://other.test/detail',
        semanticLabel: '百科',
      }),
    ];
    const first = buildTaskClusters(nodes);
    assert.equal(first.length, 2);
    const next = applyModelJudgment(
      nodes,
      first,
      { merges: [[1, 2]] },
      {},
      buildTaskClusters,
    );
    assert.equal(next.length, 1);
    assert.ok(next[0].edges.model >= 1);
  });

  it('hints yuque BETTR docs with Bettr Promotion via title/url/intro, not slug-only', () => {
    const yuque = 'https://yuque.antfin.com/ot2rzd/tech/bettr-plan';
    const marmot = 'https://www.marmot-cloud.com/bettr/bettr-promotion/it';
    const nodes = [
      tab({
        id: 1,
        url: yuque,
        title: 'BETTR信贷智能增长平台一期技术方案',
        semanticLabel: '批量发奖demo',
        summary: buildTabSummary({
          title: 'BETTR信贷智能增长平台一期技术方案',
          url: yuque,
          text: 'Bettr Promotion 一期技术方案与权益、活动、发奖。',
        }),
      }),
      tab({
        id: 2,
        url: marmot,
        title: 'bettr-promotion · Marmot',
        semanticLabel: 'Bettr Promotion',
        summary: buildTabSummary({
          title: 'bettr-promotion · Marmot',
          url: marmot,
          text: '营销活动控制台。',
        }),
      }),
    ];
    const clusters = buildTaskClusters(nodes);
    assert.equal(clusters.length, 2);
    const summaries = new Map(nodes.map((n) => [n.id, n.summary]));
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const payload = buildJudgePayload(clusters, summaries, nodesById);
    const prompt = formatJudgeUserPrompt(payload);
    assert.match(prompt, /yuque\.antfin\.com/);
    assert.match(prompt, /BETTR信贷智能增长平台/);
    assert.match(prompt, /title:/);
    assert.ok(lexicalHintTokens('BETTR信贷 技术方案').some((t) => t.includes('bettr') || t.includes('信贷')));
    const hinted = proposeCandidatePairs(clusters, summaries, nodesById);
    assert.ok(hinted.length >= 1);
  });

  it('honors session split over model merge', () => {
    const nodes = [
      tab({ id: 1, url: 'https://a.example/x', semanticLabel: '甲' }),
      tab({ id: 2, url: 'https://b.example/y', semanticLabel: '乙' }),
    ];
    const first = buildTaskClusters(nodes, { sessionSplits: [[1, 2]] });
    const next = applyModelJudgment(
      nodes,
      first,
      { merges: [[1, 2]] },
      { sessionSplits: [[1, 2]] },
      buildTaskClusters,
    );
    assert.equal(next.length, 2);
  });
});

/**
 * Screenshot fixture: Bettr Promotion (5, cross-window) vs 批量发奖demo (4 yuque).
 * Rules must not hard-merge them; the judge prompt must carry title+full URL+intro+nav
 * so a model can merge (same BETTR project) or keep split (docs vs unrelated runtime).
 */
const BETTR_TABS = [
  {
    id: 101,
    windowId: 3,
    url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/iteration',
    title: 'bettr-promotion · Marmot',
    semanticLabel: 'Bettr Promotion',
    intro: '营销活动迭代控制台，配置 Bettr Promotion 活动。',
    referrerUrl: '',
  },
  {
    id: 102,
    windowId: 3,
    url: 'https://bettr-promotion-dev-unio.page.alipay.net/page/bettr-promotion/home',
    title: 'bettr-promotion-dev-unio · 首页',
    semanticLabel: 'Bettr Promotion',
    intro: 'Unio 环境的 Bettr Promotion 工作台。',
    openerTabId: 101,
    openerFromNavigation: true,
  },
  {
    id: 103,
    windowId: 5,
    url: 'https://bettr-promotion-dev-unio.page.alipay.net/page/bettr-promotion/activity',
    title: 'bettr-promotion-dev-unio · 活动',
    semanticLabel: 'Bettr Promotion',
    intro: '活动列表页，与营销发奖同一产品。',
  },
  {
    id: 104,
    windowId: 5,
    url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/console',
    title: 'bettr-promotion · Marmot',
    semanticLabel: 'Bettr Promotion',
    intro: 'Marmot 控制台，Bettr Promotion 运营。',
  },
  {
    id: 105,
    windowId: 5,
    url: 'https://bettr-promotion-marketing-console.example.com/login',
    title: 'bettr-promotion marketing console',
    semanticLabel: 'Bettr Promotion',
    intro: 'Marketing 登录页，同一 Bettr Promotion 产品。',
  },
];

const YUQUE_TABS = [
  {
    id: 201,
    windowId: 1,
    url: 'https://yuque.antfin.com/ot2rzd/scbe7okvgau39lyf3ggg',
    title: '创建权益demo（PRD 10.14更新版）',
    semanticLabel: '批量发奖demo',
    intro: 'BETTR Promotion 权益配置 PRD，说明如何创建权益。',
  },
  {
    id: 202,
    windowId: 1,
    url: 'https://yuque.antfin.com/ot2rzd/scbe7o0nixq4awu8higy',
    title: '活动管理demo',
    semanticLabel: '批量发奖demo',
    intro: 'BETTR 活动管理文档，对应 Promotion 活动后台。',
  },
  {
    id: 203,
    windowId: 1,
    url: 'https://yuque.antfin.com/ot2rzd/scbe7ovhz5l0ld20nlgtt',
    title: '批量发奖demo',
    semanticLabel: '批量发奖demo',
    intro: '批量发奖 demo 说明，对接 Bettr Promotion 发奖接口。',
  },
  {
    id: 204,
    windowId: 1,
    url: 'https://yuque.antfin.com/ot2rzd/tech/bettr-prd',
    title: 'BETTR信贷智能增长平台一期技术方案',
    semanticLabel: '批量发奖demo',
    intro: 'Bettr Promotion 一期技术方案与权益、活动、发奖。',
  },
];

function screenshotNodes() {
  return [...BETTR_TABS, ...YUQUE_TABS].map((t) =>
    tab({
      ...t,
      summary: buildTabSummary({
        title: t.title,
        url: t.url,
        text: t.intro,
      }),
      referrerUrl: t.referrerUrl,
      openerTabId: t.openerTabId,
    }),
  );
}

/** Side-panel already shows two logical tasks (screenshot). */
function screenshotSessionMerges() {
  const a = recordSessionFeedback(
    { merges: [], splits: [] },
    'merge',
    BETTR_TABS.map((t) => t.id),
  );
  return recordSessionFeedback(a, 'merge', YUQUE_TABS.map((t) => t.id));
}

function simulateJudge(nodes, modelRaw, buildOpts = {}) {
  const clusters = buildTaskClusters(nodes, buildOpts);
  const summaries = new Map(nodes.map((n) => [n.id, n.summary]));
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const payload = buildJudgePayload(clusters, summaries, nodesById);
  const userPrompt = formatJudgeUserPrompt(payload);
  const fullPrompt = `${SAME_GROUP_SYSTEM_PROMPT}\n\n---\n${userPrompt}`;
  const judgment = parseJudgeResponse(modelRaw);
  const next = applyModelJudgment(nodes, clusters, judgment, buildOpts, buildTaskClusters);
  return { clusters, payload, userPrompt, fullPrompt, judgment, next };
}

describe('SAME_GROUP_SYSTEM_PROMPT + screenshot judge simulation', () => {
  it('system prompt requires title + full URL + intro and allows yuque↔Bettr when same project', () => {
    assert.match(SAME_GROUP_SYSTEM_PROMPT, /page title/i);
    assert.match(SAME_GROUP_SYSTEM_PROMPT, /full URL/i);
    assert.match(SAME_GROUP_SYSTEM_PROMPT, /intro|summary/i);
    assert.match(SAME_GROUP_SYSTEM_PROMPT, /Yuque|语雀/);
    assert.match(SAME_GROUP_SYSTEM_PROMPT, /BETTR|Bettr/);
    assert.match(SAME_GROUP_SYSTEM_PROMPT, /HINTS only|hints only/i);
    assert.match(SAME_GROUP_SYSTEM_PROMPT, /two jobs|keep them separate/i);
    assert.match(SAME_GROUP_SYSTEM_PROMPT, /share a Chrome window|opened around the same time/i);
    assert.match(SAME_GROUP_SYSTEM_PROMPT, /Independently opened/i);
  });

  it('rules do not hard-merge yuque docs with Bettr consoles (slug is not authority)', () => {
    const nodes = screenshotNodes();
    const { clusters } = simulateJudge(nodes, '{"merges":[]}');
    const yuqueIds = new Set(YUQUE_TABS.map((t) => t.id));
    const mixed = clusters.some(
      (c) => c.tabIds.some((id) => yuqueIds.has(id)) && c.tabIds.some((id) => !yuqueIds.has(id)),
    );
    assert.equal(mixed, false, 'regex/slug must not union yuque with runtime');
    assert.ok(clusters.length >= 2);
  });

  it('judge user prompt carries title + full URL + intro + nav for every screenshot tab', () => {
    const nodes = screenshotNodes();
    const { payload, userPrompt } = simulateJudge(nodes, '{"merges":[]}');
    const summaries = payload.clusters.flatMap((c) => c.summaries);
    assert.equal(summaries.length, 9);
    for (const s of summaries) {
      assert.ok(s.title, `tab ${s.tabId} missing title`);
      assert.ok(s.url.startsWith('http'), `tab ${s.tabId} missing full URL`);
      assert.ok(s.intro, `tab ${s.tabId} missing intro`);
      assert.match(userPrompt, new RegExp(`title: ${s.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      assert.match(userPrompt, new RegExp(`url: ${s.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      assert.match(userPrompt, new RegExp(`intro: ${s.intro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
    assert.match(userPrompt, /nav: openerTab 101/);
    assert.match(userPrompt, /Decide from title \+ full URL \+ intro/);
    assert.match(userPrompt, /Same window or nearby open time is not a merge/);
    assert.ok(!userPrompt.includes('BODY'));
    const hinted = proposeCandidatePairs(
      payload.clusters.map((c) => ({ id: c.id, tabIds: c.tabIds, label: c.label })),
      new Map(nodes.map((n) => [n.id, n.summary])),
      new Map(nodes.map((n) => [n.id, n])),
    );
    assert.ok(
      hinted.length >= 1,
      'lexical/title overlap should propose yuque↔Bettr as a candidate, not a decision',
    );
  });

  it('scripted model merge (same BETTR project) joins the two screenshot tasks', () => {
    const nodes = screenshotNodes();
    const session = screenshotSessionMerges();
    const { clusters, next, judgment } = simulateJudge(
      nodes,
      '```json\n{"merges":[[101,201]]}\n```',
      { sessionMerges: session.merges },
    );
    assert.deepEqual(judgment.merges, [[101, 201]]);
    assert.equal(clusters.length, 2);
    assert.equal(next.length, 1);
    assert.equal(next[0].tabIds.length, 9);
    assert.ok(next[0].edges.model >= 1);
    assert.match(next[0].label, /Bettr Promotion/i);
  });

  it('scripted model empty keeps docs vs runtime split when intent differs', () => {
    const nodes = screenshotNodes();
    const session = screenshotSessionMerges();
    const { next } = simulateJudge(nodes, '{"merges":[]}', { sessionMerges: session.merges });
    assert.equal(next.length, 2);
    const yuqueIds = new Set(YUQUE_TABS.map((t) => t.id));
    const mixed = next.some(
      (c) => c.tabIds.some((id) => yuqueIds.has(id)) && c.tabIds.some((id) => !yuqueIds.has(id)),
    );
    assert.equal(mixed, false);
  });

  it('rich fields distinguish unrelated docs (no BETTR tokens) from Promotion runtime', () => {
    const nodes = [
      ...BETTR_TABS.map((t) =>
        tab({
          ...t,
          summary: buildTabSummary({ title: t.title, url: t.url, text: t.intro }),
        }),
      ),
      tab({
        id: 301,
        windowId: 1,
        url: 'https://yuque.antfin.com/other-team/oncall/runbook',
        title: '机房值班手册',
        semanticLabel: '值班',
        summary: buildTabSummary({
          title: '机房值班手册',
          url: 'https://yuque.antfin.com/other-team/oncall/runbook',
          text: '网络故障升级路径，与营销发奖无关。',
        }),
      }),
    ];
    const { userPrompt, payload } = simulateJudge(nodes, '{"merges":[]}');
    assert.match(userPrompt, /机房值班手册/);
    assert.match(userPrompt, /网络故障升级路径/);
    const duty = payload.clusters
      .flatMap((c) => c.summaries)
      .find((s) => s.tabId === 301);
    assert.ok(duty);
    assert.ok(!/bettr|promotion|信贷/i.test(`${duty.title} ${duty.intro}`));
  });
});

describe('model-first batch judgment — independent vs product tabs', () => {
  const t0 = 2_000_000;

  it('keeps independently opened same-window tabs split; model can still join product-path tabs', () => {
    const nodes = [
      tab({
        id: 11,
        windowId: 1,
        url: 'https://bettr-promotion-dev-unio.page.alipay.net/page/home',
        title: 'bettr-promotion-dev-unio',
        semanticLabel: 'Unio',
        createdAt: t0,
        summary: buildTabSummary({
          title: 'bettr-promotion-dev-unio',
          url: 'https://bettr-promotion-dev-unio.page.alipay.net/page/home',
          text: 'Unio 环境的 Bettr Promotion 工作台。',
        }),
      }),
      tab({
        id: 12,
        windowId: 1,
        url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/console',
        title: 'bettr-promotion · Marmot',
        semanticLabel: 'Marmot',
        createdAt: t0 + 6_000,
        summary: buildTabSummary({
          title: 'bettr-promotion · Marmot',
          url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/console',
          text: 'Marmot 控制台，Bettr Promotion 运营。',
        }),
      }),
      tab({
        id: 21,
        windowId: 1,
        openerTabId: 11,
        openerFromNavigation: false,
        url: 'https://chat.example.com/c/seo-draft',
        title: '搭建SEO内容工作台',
        semanticLabel: '写作',
        createdAt: t0 + 10_000,
        summary: buildTabSummary({
          title: '搭建SEO内容工作台',
          url: 'https://chat.example.com/c/seo-draft',
          text: '独立打开的写作会话，与投放控制台无关。',
        }),
      }),
      tab({
        id: 22,
        windowId: 1,
        openerTabId: 11,
        openerFromNavigation: false,
        url: 'https://licenses.example.org/by/4.0/',
        title: 'License deed',
        semanticLabel: '许可协议',
        createdAt: t0 + 18_000,
        summary: buildTabSummary({
          title: 'License deed',
          url: 'https://licenses.example.org/by/4.0/',
          text: 'Creative Commons 许可文本，独立打开。',
        }),
      }),
      tab({
        id: 23,
        windowId: 1,
        openerTabId: 11,
        openerFromNavigation: false,
        url: 'https://ops.corp.example.net/env/5987128',
        title: 'Env dashboard',
        semanticLabel: '环境',
        createdAt: t0 + 24_000,
        summary: buildTabSummary({
          title: 'Env dashboard',
          url: 'https://ops.corp.example.net/env/5987128',
          text: '通用环境管理页，不是投放产品控制台。',
        }),
      }),
    ];

    const { clusters, payload, next } = simulateJudge(nodes, '{"merges":[[11,12]]}');
    assert.equal(clusters.length, 5, 'rules must not suck independent tabs into the product task');
    const product = clusters.find((c) => c.tabIds.includes(11));
    assert.ok(product);
    assert.equal(product.tabIds.includes(21), false);
    assert.equal(product.tabIds.includes(22), false);
    assert.equal(product.tabIds.includes(23), false);
    assert.ok(payload.candidates.length >= 1);
    assert.ok(
      payload.clusters.flatMap((c) => c.summaries).every((s) => s.title && s.url),
    );
    const independentNav = payload.clusters
      .flatMap((c) => c.summaries)
      .filter((s) => [21, 22, 23].includes(s.tabId))
      .map((s) => s.nav || '');
    assert.equal(
      independentNav.some((nav) => /openerTab/.test(nav)),
      false,
      'Chrome tab-strip opener must not be sent as a navigation fact',
    );

    assert.equal(next.length, 4);
    const joined = next.find((c) => c.tabIds.includes(11) && c.tabIds.includes(12));
    assert.ok(joined);
    assert.deepEqual(joined.tabIds.slice().sort((a, b) => a - b), [11, 12]);
    assert.ok(next.some((c) => c.tabIds.length === 1 && c.tabIds[0] === 21));
    assert.ok(next.some((c) => c.tabIds.length === 1 && c.tabIds[0] === 22));
    assert.ok(next.some((c) => c.tabIds.length === 1 && c.tabIds[0] === 23));
  });
});

