/**
 * URL patterns for durable 任务导航图 priors.
 * Never collapse to hostname-only — that would recreate domain aggregation.
 */
import { shouldSkipUrl } from './url-utils.js';

/**
 * True when a path segment is an opaque id (digits, uuid, long hex).
 * @param {string} seg
 */
export function isIdLikeSegment(seg) {
  if (!seg) return false;
  if (/^\d+$/.test(seg)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seg)) {
    return true;
  }
  if (/^[0-9a-f]{8,}$/i.test(seg) && seg.length >= 8) return true;
  // Ticket / issue keys: ABC-42, ENG-108, #123
  if (/^#?\d+$/.test(seg)) return true;
  if (/^[a-z]{1,12}-\d+$/i.test(seg)) return true;
  return false;
}

/**
 * origin + pathname with id-like segments replaced by `*`.
 * Query/hash dropped. Empty / skipped URLs → ''.
 * @param {string | undefined} url
 * @returns {string}
 */
export function toUrlPattern(url) {
  if (!url || shouldSkipUrl(url)) return '';
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const segs = u.pathname.split('/').filter(Boolean).map((s) => {
      try {
        return isIdLikeSegment(decodeURIComponent(s)) ? '*' : s;
      } catch {
        return isIdLikeSegment(s) ? '*' : s;
      }
    });
    const path = segs.length ? `/${segs.join('/')}` : '/';
    return `${u.origin.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return '';
  }
}

/**
 * Hostname-only or origin+/* — too generic to store as a learned prior
 * (would group primarily by domain).
 * @param {string} pattern
 */
export function isShallowPattern(pattern) {
  if (!pattern) return true;
  try {
    const u = new URL(pattern);
    const segs = u.pathname.split('/').filter(Boolean);
    return segs.length === 0 || (segs.length === 1 && segs[0] === '*');
  } catch {
    return true;
  }
}

/**
 * Canonical pair key (order-independent).
 * @param {string} a
 * @param {string} b
 */
export function priorPairKey(a, b) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}
