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
 * Exact-dedupe identity: origin + path + query + hash.
 * Query parameter order is significant (no sorting / dropping).
 * Empty vs present `?` or `#` stay distinct. Hash is never stripped.
 * @param {string | undefined} url
 */
export function exactUrlIdentity(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

/**
 * Chrome `tabs.Tab.url` / `changeInfo.url` often omit the fragment.
 * If `observed` is the same document (origin + path + query) and carries a
 * hash the committed URL lacks, keep that hash. Different search strings
 * are different pages — never copy query params across.
 * @param {string | undefined} committed
 * @param {string | undefined} observed
 */
export function coalesceExactUrl(committed, observed) {
  const aRaw = (committed || '').trim();
  const bRaw = (observed || '').trim();
  if (!aRaw) return bRaw;
  if (!bRaw) return aRaw;
  let a;
  let b;
  try {
    a = new URL(aRaw);
    b = new URL(bRaw);
  } catch {
    return aRaw;
  }
  if (a.origin !== b.origin || a.pathname !== b.pathname) return a.href;
  if (a.search !== b.search) return a.href;
  if (!aRaw.includes('#') && bRaw.includes('#')) {
    return `${a.href}${bRaw.slice(bRaw.indexOf('#'))}`;
  }
  return a.href;
}

/**
 * Normalize URL for exact-dedupe comparison.
 * Always keeps pathname, search, and hash. `ignoreHash` is ignored (hash is identity).
 * @param {string} url
 * @param {{ ignoreHash?: boolean }} [_opts]
 * @returns {string}
 */
export function normalizeUrl(url, _opts = {}) {
  void _opts;
  return exactUrlIdentity(url);
}
