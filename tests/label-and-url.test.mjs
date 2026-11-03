/**
 * Minimal Node tests for pure helpers (no Chrome APIs).
 * Run: node --test tests/label-and-url.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  heuristicLabel,
  rejectDomainishLabel,
  sanitizeLabel,
} from '../shared/label-utils.js';
import { normalizeUrl, shouldSkipUrl } from '../shared/url-utils.js';

describe('normalizeUrl', () => {
  it('keeps hash by default', () => {
    assert.equal(
      normalizeUrl('https://example.com/a#x'),
      'https://example.com/a#x',
    );
  });
  it('strips hash when ignoreHash', () => {
    assert.equal(
      normalizeUrl('https://example.com/a#x', { ignoreHash: true }),
      'https://example.com/a',
    );
  });
  it('keeps trailing slash difference (exact)', () => {
    assert.notEqual(
      normalizeUrl('https://example.com/a'),
      normalizeUrl('https://example.com/a/'),
    );
  });
  it('returns empty for empty input', () => {
    assert.equal(normalizeUrl(''), '');
  });
});

describe('shouldSkipUrl', () => {
  it('skips chrome internals', () => {
    assert.equal(shouldSkipUrl('chrome://extensions'), true);
    assert.equal(shouldSkipUrl('about:blank'), true);
    assert.equal(shouldSkipUrl('https://example.com'), false);
  });
});

describe('rejectDomainishLabel / sanitizeLabel', () => {
  it('rejects bare domains and brands', () => {
    assert.equal(rejectDomainishLabel('github.com'), '');
    assert.equal(rejectDomainishLabel('GitHub'), '');
    assert.equal(rejectDomainishLabel('知乎'), '');
    assert.equal(sanitizeLabel('GitHub'), '未分类');
  });
  it('keeps real topics', () => {
    assert.equal(sanitizeLabel('React hooks 入门'), 'React hooks 入门');
    assert.equal(sanitizeLabel('"API 设计"'), 'API 设计');
  });
});

describe('heuristicLabel — never domain aggregation', () => {
  it('same host different topics → different labels', () => {
    const a = heuristicLabel(
      'How to write React hooks',
      'A tutorial on useEffect and custom hooks getting started',
      'https://github.com/foo/react-hooks-guide',
    );
    const b = heuristicLabel(
      'Kubernetes networking deep dive',
      'CNI plugins and service mesh stack trace troubleshooting debug',
      'https://github.com/foo/k8s-net',
    );
    assert.notEqual(a, b);
    assert.ok(!/github/i.test(a), `label a must not be domain: ${a}`);
    assert.ok(!/github/i.test(b), `label b must not be domain: ${b}`);
  });
  it('does not fall back to hostname when title/body empty', () => {
    const label = heuristicLabel('', '', 'https://obscure-site.example');
    assert.equal(label, '未分类');
  });
  it('uses topic rules from body', () => {
    const label = heuristicLabel(
      'Something',
      'This page is an OpenAPI reference for the payments REST API',
      'https://docs.vendor.com/payments',
    );
    assert.equal(label, 'API 文档');
  });
});
