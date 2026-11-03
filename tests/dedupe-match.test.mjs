/**
 * Cross-window exact URL match (pure).
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

  it('keeps hash distinct unless ignoreHash', () => {
    const tabs = [
      { id: 1, windowId: 1, url: 'https://example.com/p#1' },
      { id: 2, windowId: 1, url: 'https://example.com/p#2' },
    ];
    assert.equal(findExactUrlMatch(tabs, 2, 'https://example.com/p#2'), null);
    const ignored = findExactUrlMatch(tabs, 2, 'https://example.com/p#2', { ignoreHash: true });
    assert.equal(ignored?.id, 1);
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
