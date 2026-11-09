import { SKIP_URL_PREFIXES } from './constants.js';

/** @param {string | undefined} url */
export function shouldSkipUrl(url) {
  if (!url) return true;
  return SKIP_URL_PREFIXES.some((p) => url.startsWith(p));
}

/**
 * Chrome/Edge new-tab / blank destinations. A tab born here was not opened
 * via link navigation — Chrome may still set openerTabId to the previous tab.
 * @param {string | undefined} url
 */
export function isEphemeralNewTabUrl(url) {
  const raw = (url || '').trim();
  if (!raw) return true;
  let href = raw;
  try {
    href = new URL(raw).href;
  } catch {
    href = raw;
  }
  const u = href.toLowerCase();
  if (u === 'about:blank' || u === 'about:newtab' || u === 'about:newtab/') return true;
  if (u.startsWith('chrome://newtab') || u.startsWith('chrome://new-tab-page')) return true;
  if (u.startsWith('edge://newtab') || u.startsWith('brave://newtab')) return true;
  return false;
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
