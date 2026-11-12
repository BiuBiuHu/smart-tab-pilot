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
import {
  coalesceExactUrl,
  exactUrlIdentity,
  isEphemeralNewTabUrl,
  normalizeUrl,
  shouldSkipUrl,
} from '../shared/url-utils.js';

describe('exactUrlIdentity / normalizeUrl', () => {
  it('keeps hash and never strips it', () => {
    assert.equal(exactUrlIdentity('https://example.com/a#x'), 'https://example.com/a#x');
    assert.equal(
      normalizeUrl('https://example.com/a#x', { ignoreHash: true }),
      'https://example.com/a#x',
    );
  });
  it('keeps query strings and does not sort params', () => {
    assert.equal(
      exactUrlIdentity('https://example.com/p?b=2&a=1'),
      'https://example.com/p?b=2&a=1',
    );
    assert.notEqual(
      exactUrlIdentity('https://example.com/p?b=2&a=1'),
      exactUrlIdentity('https://example.com/p?a=1&b=2'),
    );
  });
  it('treats empty vs present hash/query as different identities', () => {
    const base = exactUrlIdentity('https://example.com/p');
    assert.notEqual(base, exactUrlIdentity('https://example.com/p#'));
    assert.notEqual(base, exactUrlIdentity('https://example.com/p?'));
    assert.notEqual(base, exactUrlIdentity('https://example.com/p?a=1'));
    assert.notEqual(base, exactUrlIdentity('https://example.com/p#x'));
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

describe('coalesceExactUrl', () => {
  it('fills a Chrome-stripped fragment when origin+path+query match', () => {
    assert.equal(
      coalesceExactUrl('https://example.com/p', 'https://example.com/p#install'),
      'https://example.com/p#install',
    );
    assert.equal(
      coalesceExactUrl('https://example.com/p?a=1', 'https://example.com/p?a=1#x'),
      'https://example.com/p?a=1#x',
    );
  });
  it('does not copy a hash across different query strings', () => {
    assert.equal(
      coalesceExactUrl('https://example.com/p?q=new', 'https://example.com/p?q=old#x'),
      'https://example.com/p?q=new',
    );
  });
});

describe('shouldSkipUrl', () => {
  it('skips chrome internals', () => {
    assert.equal(shouldSkipUrl('chrome://extensions'), true);
    assert.equal(shouldSkipUrl('about:blank'), true);
    assert.equal(shouldSkipUrl('https://example.com'), false);
  });
});

describe('isEphemeralNewTabUrl', () => {
  it('treats blank and browser new-tab pages as non-navigation births', () => {
    assert.equal(isEphemeralNewTabUrl(''), true);
    assert.equal(isEphemeralNewTabUrl('about:blank'), true);
    assert.equal(isEphemeralNewTabUrl('chrome://newtab/'), true);
    assert.equal(isEphemeralNewTabUrl('chrome://new-tab-page/'), true);
    assert.equal(isEphemeralNewTabUrl('edge://newtab'), true);
    assert.equal(isEphemeralNewTabUrl('https://example.com/page'), false);
    assert.equal(isEphemeralNewTabUrl('http://127.0.0.1:8787/'), false);
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
