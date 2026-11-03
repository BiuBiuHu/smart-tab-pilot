import { SKIP_URL_PREFIXES } from './constants.js';

/** @param {string | undefined} url */
export function shouldSkipUrl(url) {
  if (!url) return true;
  return SKIP_URL_PREFIXES.some((p) => url.startsWith(p));
}

/**
 * Normalize URL for exact-dedupe comparison.
 * Keeps pathname/search exact (including trailing slash). Hash stripped only when ignoreHash.
 * @param {string} url
 * @param {{ ignoreHash?: boolean }} opts
 * @returns {string}
 */
export function normalizeUrl(url, { ignoreHash = false } = {}) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    if (ignoreHash) u.hash = '';
    // Keep pathname/search/hash as-is; do not strip trailing slash (exact match).
    return u.href;
  } catch {
    return url;
  }
}
