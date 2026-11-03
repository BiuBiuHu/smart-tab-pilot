import { SKIP_URL_PREFIXES } from './constants.js';

/** @param {string | undefined} url */
export function shouldSkipUrl(url) {
  if (!url) return true;
  return SKIP_URL_PREFIXES.some((p) => url.startsWith(p));
}

/**
 * Normalize URL for exact-dedupe comparison.
 * @param {string} url
 * @param {{ ignoreHash?: boolean }} opts
 */
export function normalizeUrl(url, { ignoreHash = false } = {}) {
  try {
    const u = new URL(url);
    if (ignoreHash) u.hash = '';
    // Keep pathname/search/hash as-is; do not strip trailing slash (exact match).
    return u.href;
  } catch {
    return url;
  }
}
