/**
 * Short tab summaries — never persist a full page body.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TAB_SUMMARY_EXCERPT_MAX,
  TAB_SUMMARY_STORE_CAP,
} from '../shared/constants.js';
import {
  buildTabSummary,
  capSummaryStore,
  excerptSentences,
  formatSummaryLine,
  summaryIsStale,
  summaryPathKey,
} from '../shared/tab-summary.js';

describe('excerptSentences', () => {
  it('keeps the first two sentences and caps length', () => {
    const long = `${'产品介绍。'.repeat(2)}${'后面还有很多字。'.repeat(80)}`;
    const out = excerptSentences(long);
    assert.ok(out.length <= TAB_SUMMARY_EXCERPT_MAX);
    assert.match(out, /产品介绍/);
    assert.ok(out.length <= TAB_SUMMARY_EXCERPT_MAX);
    assert.ok(!out.includes('后面还有很多字。'.repeat(20)));
  });

  it('returns empty for blank extract', () => {
    assert.equal(excerptSentences('   '), '');
  });
});

describe('buildTabSummary', () => {
  it('stores title, product slugs, path key — not the full body', () => {
    const body = `创建权益页面说明。这是第二句摘要。${'正文填充'.repeat(400)}`;
    const s = buildTabSummary({
      title: '创建权益demo',
      url: 'https://www.marmot-cloud.com/bettr/bettr-promotion/it/console',
      text: body,
    });
    assert.equal(s.title, '创建权益demo');
    assert.ok(s.slugs.includes('bettr-promotion'));
    assert.match(s.pathKey, /bettr\/bettr-promotion/);
    assert.ok(s.excerpt.length <= TAB_SUMMARY_EXCERPT_MAX);
    assert.ok(s.excerpt.length < body.length);
    assert.ok(!s.excerpt.includes('正文填充'.repeat(20)));
    assert.ok(!('text' in s));
    assert.ok(!('body' in s));
  });

  it('uses loopback port as path key for localhost demos', () => {
    const s = buildTabSummary({
      title: '活动管理demo',
      url: 'http://127.0.0.1:8787/campaign',
    });
    assert.equal(s.pathKey, 'loopback:8787');
  });
});

describe('summaryPathKey / stale / cap', () => {
  it('does not collapse unrelated example.com pages to hostname-only affinity', () => {
    assert.ok(summaryPathKey('https://example.com/a'));
    assert.notEqual(
      summaryPathKey('https://www.marmot-cloud.com/bettr/bettr-promotion/it'),
      summaryPathKey('https://www.marmot-cloud.com/other-suite/dashboard'),
    );
  });

  it('marks a summary stale after navigation', () => {
    const s = buildTabSummary({ title: 'A', url: 'https://a.test/x' });
    assert.equal(summaryIsStale(s, 'https://a.test/x'), false);
    assert.equal(summaryIsStale(s, 'https://a.test/y'), true);
  });

  it('caps the store by dropping oldest', () => {
    /** @type {Record<string, import('../shared/tab-summary.js').TabSummary>} */
    const store = {};
    for (let i = 0; i < TAB_SUMMARY_STORE_CAP + 5; i++) {
      store[String(i)] = buildTabSummary({
        title: `t${i}`,
        url: `https://ex.test/${i}`,
        extractedAt: i,
      });
    }
    const capped = capSummaryStore(store);
    assert.equal(Object.keys(capped).length, TAB_SUMMARY_STORE_CAP);
    assert.ok(!capped['0']);
    assert.ok(capped[String(TAB_SUMMARY_STORE_CAP + 4)]);
  });

  it('formats a compact line for later analysis / LLM', () => {
    const line = formatSummaryLine(
      buildTabSummary({
        title: '登录态异常',
        url: 'https://bettr-promotion-dev-unio.page.alipay.net/page/b',
        text: '请重新登录营销控制台。',
      }),
    );
    assert.match(line, /登录态异常|bettr/i);
    assert.ok(line.length < 500);
  });
});
