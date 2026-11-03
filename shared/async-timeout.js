/**
 * Fail-soft / deadline helpers. Used so hung tabs.sendMessage or a dead SW
 * cannot pin the side panel "立即整理" button forever.
 */

/**
 * Resolve with `fallback` if `promise` does not settle within `ms`.
 * Rejections also fall back (extract/classify must never throw into grouping).
 * @template T
 * @param {Promise<T> | T} promise
 * @param {number} ms
 * @param {T} fallback
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, fallback) {
  let timer = 0;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  const wrapped = Promise.resolve(promise).then(
    (value) => ({ timedOut: false, value }),
    () => ({ timedOut: true }),
  );
  return Promise.race([wrapped, timeout]).then((result) => {
    clearTimeout(timer);
    if (result && result.timedOut === false) return result.value;
    return fallback;
  });
}

/**
 * Reject if `promise` does not settle within `ms`.
 * @template T
 * @param {Promise<T> | T} promise
 * @param {number} ms
 * @param {string} [message]
 * @returns {Promise<T>}
 */
export function withDeadline(promise, ms, message = 'timeout') {
  let timer = 0;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([Promise.resolve(promise), deadline]).finally(() => {
    clearTimeout(timer);
  });
}
