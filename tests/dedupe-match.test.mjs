/**
 * Cross-window exact URL match (pure).
 * Identity is origin + path + query + hash; query order is significant.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findExactUrlMatch } from '../shared/dedupe-match.js';

describe('findExactUrlMatch', () => {
  it('finds the older tab in another window', () => {
    const match = findExactUrlMatch(
      [
        { id: 11, windowId: 1, url: 'https://example.com/a' },
        { id: 22, windowId: 2, url: 'https://example.com/a' },
      ],
      22,
      'https://example.com/a',
    );
    assert.ok(match);
    assert.equal(match.id, 11);
    assert.equal(match.windowId, 1);
  });

  it('same origin+path but different hash are not duplicates', () => {
    const tabs = [
      { id: 1, windowId: 1, url: 'https://example.com/p#install' },
      { id: 2, windowId: 2, url: 'https://example.com/p#api' },
    ];
    assert.equal(findExactUrlMatch(tabs, 2, 'https://example.com/p#api'), null);
    assert.equal(
      findExactUrlMatch(tabs, 2, 'https://example.com/p#api', { ignoreHash: true }),
      null,
      'ignoreHash must not collapse fragments',
    );
  });

  it('same origin+path but different query params are not duplicates', () => {
    const tabs = [
      { id: 1, windowId: 1, url: 'https://example.com/search?q=alpha' },
      { id: 2, windowId: 3, url: 'https://example.com/search?q=beta' },
    ];
    assert.equal(findExactUrlMatch(tabs, 2, 'https://example.com/search?q=beta'), null);
    assert.equal(
      findExactUrlMatch(
        [{ id: 1, windowId: 1, url: 'https://example.com/p?b=2&a=1' }],
        9,
        'https://example.com/p?a=1&b=2',
      ),
      null,
      'query parameter order is significant',
    );
  });

  it('identical full URL including hash+params still dedupes across windows', () => {
    const url = 'https://example.com/app?tab=plan&x=1#section-2';
    const match = findExactUrlMatch(
      [
        { id: 4, windowId: 8, url },
        { id: 40, windowId: 9, url },
      ],
      40,
      url,
    );
    assert.ok(match);
    assert.equal(match.id, 4);
    assert.equal(match.windowId, 8);
  });

  it('empty vs present hash/query are different pages', () => {
    const path = [{ id: 1, windowId: 1, url: 'https://example.com/p' }];
    assert.equal(findExactUrlMatch(path, 2, 'https://example.com/p#'), null);
    assert.equal(findExactUrlMatch(path, 2, 'https://example.com/p?'), null);
    assert.equal(findExactUrlMatch(path, 2, 'https://example.com/p?a=1'), null);
    assert.equal(findExactUrlMatch(path, 2, 'https://example.com/p#x'), null);

    assert.equal(
      findExactUrlMatch(
        [{ id: 1, windowId: 1, url: 'https://example.com/p?' }],
        2,
        'https://example.com/p',
      ),
      null,
    );
    assert.equal(
      findExactUrlMatch(
        [{ id: 1, windowId: 1, url: 'https://example.com/p#' }],
        2,
        'https://example.com/p',
      ),
      null,
    );
    assert.ok(
      findExactUrlMatch(
        [{ id: 1, windowId: 1, url: 'https://example.com/p#' }],
        2,
        'https://example.com/p#',
      ),
    );
  });

  it('restores Chrome-stripped hashes from observed URLs and still keeps fragments distinct', () => {
    const tabs = [
      { id: 1, windowId: 1, url: 'https://docs.example/guide' },
      { id: 2, windowId: 2, url: 'https://docs.example/guide' },
    ];
    const observedByTabId = {
      1: 'https://docs.example/guide#install',
      2: 'https://docs.example/guide#api',
    };
    assert.equal(
      findExactUrlMatch(tabs, 2, 'https://docs.example/guide', { observedByTabId }),
      null,
    );
    const sameHash = findExactUrlMatch(
      [{ id: 1, windowId: 5, url: 'https://docs.example/guide' }],
      9,
      'https://docs.example/guide',
      {
        observedByTabId: {
          1: 'https://docs.example/guide#install',
          9: 'https://docs.example/guide#install',
        },
      },
    );
    assert.equal(sameHash?.id, 1);
  });

  it('does not copy query params from a stale observation onto a new search', () => {
    assert.equal(
      findExactUrlMatch(
        [{ id: 1, windowId: 1, url: 'https://example.com/p?q=new' }],
        2,
        'https://example.com/p?q=new',
        { observedByTabId: { 1: 'https://example.com/p?q=old#x' } },
      )?.id,
      1,
    );
    assert.equal(
      findExactUrlMatch(
        [{ id: 1, windowId: 1, url: 'https://example.com/p?q=old' }],
        2,
        'https://example.com/p?q=new',
        { observedByTabId: { 1: 'https://example.com/p?q=old#x' } },
      ),
      null,
    );
  });

  it('skips chrome internals and closing ids', () => {
    assert.equal(
      findExactUrlMatch([{ id: 1, windowId: 1, url: 'chrome://version' }], 9, 'chrome://version'),
      null,
    );
    assert.equal(
      findExactUrlMatch(
        [{ id: 1, windowId: 1, url: 'https://example.com/' }],
        2,
        'https://example.com/',
        { closingTabIds: [1] },
      ),
      null,
    );
  });

  it('does not match the navigating tab itself', () => {
    assert.equal(
      findExactUrlMatch([{ id: 5, windowId: 1, url: 'https://example.com/' }], 5, 'https://example.com/'),
      null,
    );
  });
});
