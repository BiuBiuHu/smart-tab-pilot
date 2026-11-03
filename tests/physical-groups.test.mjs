/**
 * Same-window same-title physical groups must collapse to one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coalesceWindowPlacements,
  extraTabIdsToFold,
  normalizeGroupTitle,
  pickReusableGroupId,
} from '../shared/physical-groups.js';

describe('normalizeGroupTitle', () => {
  it('ignores case and extra spaces', () => {
    assert.equal(normalizeGroupTitle('  BIGP一期  迭代 '), normalizeGroupTitle('bigp一期 迭代'));
    assert.equal(normalizeGroupTitle('LinkE'), normalizeGroupTitle('linke'));
  });
});

describe('pickReusableGroupId — never a second same title', () => {
  it('reuses the existing 「LinkE」 group instead of creating another', () => {
    const id = pickReusableGroupId({
      label: 'LinkE',
      tabIds: [11, 12],
      groups: [
        { id: 100, title: 'BIGP一期 迭代' },
        { id: 200, title: 'LinkE' },
        { id: 201, title: 'LinkE' },
      ],
      windowTabs: [
        { id: 1, groupId: 100 },
        { id: 2, groupId: 100 },
        { id: 3, groupId: 200 },
        { id: 11, groupId: -1 },
        { id: 12, groupId: 201 },
      ],
      noneId: -1,
    });
    assert.equal(id, 200);
  });

  it('folds leftover duplicate-title groups into the kept one', () => {
    const extra = extraTabIdsToFold({
      label: 'BIGP一期 迭代',
      already: [1],
      groups: [
        { id: 10, title: 'BIGP一期 迭代' },
        { id: 11, title: 'BIGP一期 迭代' },
      ],
      windowTabs: [
        { id: 1, groupId: 10 },
        { id: 2, groupId: 11 },
        { id: 3, groupId: 11 },
        { id: 9, groupId: 99 },
      ],
    });
    assert.deepEqual(extra.sort((a, b) => a - b), [2, 3]);
  });
});

describe('coalesceWindowPlacements', () => {
  it('merges two singleton clusters with the same title in one window', () => {
    const placements = coalesceWindowPlacements(
      [
        { id: 'task-1', label: 'BIGP一期 迭代', tabIds: [1], windowIds: [7], edges: {} },
        { id: 'task-2', label: 'BIGP一期 迭代', tabIds: [2], windowIds: [7], edges: {} },
        { id: 'task-3', label: 'LinkE', tabIds: [3], windowIds: [7], edges: {} },
        { id: 'task-4', label: 'linke', tabIds: [4], windowIds: [7], edges: {} },
        { id: 'task-5', label: 'LinkE', tabIds: [5], windowIds: [8], edges: {} },
      ],
      [
        { id: 1, windowId: 7 },
        { id: 2, windowId: 7 },
        { id: 3, windowId: 7 },
        { id: 4, windowId: 7 },
        { id: 5, windowId: 8 },
      ],
    );
    const w7 = placements.filter((p) => p.windowId === 7);
    assert.equal(w7.length, 2);
    const bigp = w7.find((p) => normalizeGroupTitle(p.label) === normalizeGroupTitle('BIGP一期 迭代'));
    const linke = w7.find((p) => normalizeGroupTitle(p.label) === 'linke');
    assert.deepEqual(bigp.tabIds.sort((a, b) => a - b), [1, 2]);
    assert.deepEqual(linke.tabIds.sort((a, b) => a - b), [3, 4]);
    assert.equal(placements.filter((p) => p.windowId === 8).length, 1);
  });
});
