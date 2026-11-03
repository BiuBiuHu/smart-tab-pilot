/**
 * Model same-group hook — second layer after rules, summaries only.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyModelJudgment,
  buildJudgePayload,
  formatJudgeUserPrompt,
  lexicalHintTokens,
  parseJudgeResponse,
  proposeCandidatePairs,
} from '../shared/model-group-judge.js';
import { buildTabSummary } from '../shared/tab-summary.js';
import { buildTaskClusters } from '../shared/task-graph.js';

function tab(partial) {
  return {
    id: partial.id,
    windowId: partial.windowId ?? 1,
    url: partial.url,
    title: partial.title,
    semanticLabel: partial.semanticLabel,
    summary: partial.summary,
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
