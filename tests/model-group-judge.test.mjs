/**
 * Model same-group hook — second layer after rules, summaries only.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyModelJudgment,
  buildJudgePayload,
  formatJudgeUserPrompt,
  parseJudgeResponse,
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
    assert.ok((payload.clusters[0].summaries[0].excerpt || '').length <= 280);
    const prompt = formatJudgeUserPrompt(payload);
    assert.match(prompt, /tab 1/);
    assert.ok(prompt.length < 2000);
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
