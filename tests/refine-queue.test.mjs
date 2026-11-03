/**
 * Refine queue must cover every eligible tab (no silent cap).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listUncachedEligibleTabs } from '../shared/refine-queue.js';

describe('listUncachedEligibleTabs', () => {
  it('includes all http(s) uncached tabs and skips chrome:// only', () => {
    const tabs = [];
    for (let i = 1; i <= 20; i++) {
      tabs.push({ id: i, url: `https://example.com/p/${i}` });
    }
    tabs.push({ id: 100, url: 'chrome://extensions' });
    tabs.push({ id: 101, url: 'about:blank' });
    const queued = listUncachedEligibleTabs(tabs, [3, 7]);
    assert.equal(queued.length, 18);
    assert.ok(queued.every((t) => t.id !== 100 && t.id !== 101 && t.id !== 3 && t.id !== 7));
  });

  it('does not truncate at 6', () => {
    const tabs = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      url: `https://example.com/${i}`,
    }));
    assert.equal(listUncachedEligibleTabs(tabs, []).length, 40);
  });
});
