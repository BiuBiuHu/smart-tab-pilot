/**
 * Timeout helpers for fail-soft extract / side panel RPC.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withDeadline, withTimeout } from '../shared/async-timeout.js';

describe('withTimeout', () => {
  it('returns the value when it settles in time', async () => {
    const v = await withTimeout(Promise.resolve('ok'), 50, 'fallback');
    assert.equal(v, 'ok');
  });
  it('returns fallback when the promise never settles', async () => {
    const hung = new Promise(() => {});
    const v = await withTimeout(hung, 20, 'fallback');
    assert.equal(v, 'fallback');
  });
  it('returns fallback when the promise rejects', async () => {
    const v = await withTimeout(Promise.reject(new Error('boom')), 50, 'fallback');
    assert.equal(v, 'fallback');
  });
});

describe('withDeadline', () => {
  it('resolves when work finishes', async () => {
    const v = await withDeadline(Promise.resolve(7), 50, 'timeout');
    assert.equal(v, 7);
  });
  it('rejects with the deadline message when hung', async () => {
    await assert.rejects(
      () => withDeadline(new Promise(() => {}), 15, '后台响应超时，请重试'),
      /后台响应超时/,
    );
  });
});
