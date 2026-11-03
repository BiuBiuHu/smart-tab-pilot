/**
 * Durable prior + URL pattern tests for navigation graph learning.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyFeedbackToPriors,
  bumpPrior,
  canStorePrior,
  emptyPriorStore,
  priorWeight,
} from '../shared/nav-priors.js';
import { isIdLikeSegment, isShallowPattern, toUrlPattern } from '../shared/url-pattern.js';

describe('toUrlPattern', () => {
  it('generalizes numeric / uuid path segments', () => {
    assert.equal(
      toUrlPattern('https://github.com/acme/app/issues/42?x=1#y'),
      'https://github.com/acme/app/issues/*',
    );
    assert.equal(
      toUrlPattern('https://example.com/p/550e8400-e29b-41d4-a716-446655440000'),
      'https://example.com/p/*',
    );
    assert.equal(
      toUrlPattern('https://linear.app/acme/issue/ABC-42'),
      'https://linear.app/acme/issue/*',
    );
  });
  it('keeps meaningful path (never hostname-only for a deep URL)', () => {
    const p = toUrlPattern('https://docs.vendor.com/payments/overview');
    assert.equal(p, 'https://docs.vendor.com/payments/overview');
    assert.equal(isShallowPattern(p), false);
  });
  it('marks origin-only as shallow', () => {
    assert.equal(isShallowPattern(toUrlPattern('https://github.com/')), true);
  });
  it('skips chrome internals', () => {
    assert.equal(toUrlPattern('chrome://extensions'), '');
  });
});

describe('isIdLikeSegment', () => {
  it('detects digits and hex', () => {
    assert.equal(isIdLikeSegment('42'), true);
    assert.equal(isIdLikeSegment('deadbeef'), true);
    assert.equal(isIdLikeSegment('issues'), false);
  });
});

describe('canStorePrior / bumpPrior', () => {
  it('rejects hostname-only / identical patterns (no domain aggregation)', () => {
    assert.equal(canStorePrior('https://github.com/', 'https://github.com/foo'), false);
    assert.equal(
      canStorePrior(
        'https://github.com/acme/app/issues/1',
        'https://github.com/acme/app/issues/2',
      ),
      false,
    );
    assert.equal(
      canStorePrior(
        'https://linear.app/acme/issue/ABC-1',
        'https://docs.acme.dev/oncall/runbook',
      ),
      true,
    );
  });

  it('accumulates opener co-occurrence weight', () => {
    let store = emptyPriorStore();
    store = bumpPrior(
      store,
      'https://linear.app/acme/issue/ABC-1',
      'https://docs.acme.dev/oncall/runbook',
      { source: 'opener', delta: 0.2, now: 10 },
    );
    store = bumpPrior(
      store,
      'https://linear.app/acme/issue/ABC-9',
      'https://docs.acme.dev/oncall/runbook',
      { source: 'opener', delta: 0.2, now: 20 },
    );
    const w = priorWeight(
      store,
      'https://linear.app/acme/issue/ABC-42',
      'https://docs.acme.dev/oncall/runbook',
    );
    assert.ok(w >= 0.35, `expected learned weight >= 0.35, got ${w}`);
    assert.equal(
      store.pairs[Object.keys(store.pairs)[0]].sources.opener,
      2,
    );
  });

  it('feedback merge strengthens and split weakens', () => {
    let store = emptyPriorStore();
    store = applyFeedbackToPriors(
      store,
      'https://a.example/docs/guide',
      'https://b.example/api/ref',
      'merge',
      1,
    );
    const afterMerge = priorWeight(store, 'https://a.example/docs/guide', 'https://b.example/api/ref');
    store = applyFeedbackToPriors(
      store,
      'https://a.example/docs/guide',
      'https://b.example/api/ref',
      'split',
      2,
    );
    const afterSplit = priorWeight(store, 'https://a.example/docs/guide', 'https://b.example/api/ref');
    assert.ok(afterMerge > 0);
    assert.ok(afterSplit < afterMerge);
  });
});
