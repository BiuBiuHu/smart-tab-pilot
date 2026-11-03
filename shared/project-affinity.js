/**
 * Project affinity FEATURES (candidates only).
 * Slug / path / loopback may propose pairs for the model judge.
 * They are NOT a merge authority — do not union on these keys.
 */
import { isIdLikeSegment } from './url-pattern.js';
import { shouldSkipUrl } from './url-utils.js';

const HOST_STOP = new Set([
  'www', 'com', 'org', 'net', 'io', 'dev', 'app', 'cn', 'co', 'edu', 'gov',
  'page', 'pages', 'web', 'cdn', 'static', 'assets', 'api', 'docs',
]);

const PATH_STOP = new Set([
  'www', 'docs', 'api', 'app', 'com', 'org', 'net', 'page', 'pages', 'index',
  'admin', 'login', 'logout', 'signin', 'signup', 'auth', 'static', 'assets',
  'images', 'public', 'src', 'blog', 'news', 'wiki', 'help', 'support', 'about',
  'search', 'user', 'users', 'account', 'settings', 'config', 'test', 'prod',
  'staging', 'preview', 'console', 'platform', 'service', 'server', 'client',
  'web', 'html', 'it', 'en', 'zh', 'cn', 'home', 'main', 'portal', 'dashboard',
  'issue', 'issues', 'pull', 'pulls', 'blob', 'tree', 'commit', 'commits',
  'ticket', 'tickets',
]);

/** Env / deploy tokens — never part of the canonical product key or cluster title. */
export const ENV_SLUG_PARTS = new Set([
  'dev', 'unio', 'marketing', 'console', 'staging', 'prod', 'test', 'preview',
  'sit', 'uat', 'pre', 'demo', 'local', 'de', 'us', 'cn', 'it', 'en', 'zh',
]);

/** Resource words that must not form origin+2-seg product keys (issue lists, etc.). */
const GENERIC_PREFIX_SEG = new Set([
  'issue', 'issues', 'pull', 'pulls', 'blob', 'tree', 'commit', 'commits',
  'compare', 'releases', 'tags', 'branches', 'actions', 'security', 'network',
  'graphs', 'projects', 'discussions', 'milestone', 'milestones', 'ticket',
  'tickets', 'story', 'stories', 'job', 'jobs', 'pulse', 'forks', 'watchers',
  'wiki', 'settings', 'login', 'logout', 'signin', 'signup', 'auth',
  'page', 'pages', 'index', 'home', 'it', 'en', 'zh', 'cn', 'docs', 'api',
  'admin', 'search', 'static', 'assets',
]);

/**
 * @param {string} host
 */
export function isLoopbackHost(host) {
  const h = (host || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
}

/**
 * Opaque deploy / hash suffixes: bhyapy0, unio1, deadbeef…
 * @param {string} part
 */
export function isOpaqueSuffix(part) {
  if (!part) return true;
  if (isIdLikeSegment(part)) return true;
  if (part.length >= 6 && /\d/.test(part) && /[a-z]/i.test(part)) return true;
  return false;
}

/**
 * Hyphenated product slugs from one hostname/path token.
 * `bettr-promotion-marketing-console-bhyapy0` → bettr-promotion, bettr
 * @param {string} token
 * @returns {string[]}
 */
export function slugsFromToken(token) {
  if (!token) return [];
  let decoded = token;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    /* keep raw */
  }
  const parts = decoded
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .filter((p) => !isOpaqueSuffix(p) && !HOST_STOP.has(p));
  /** @type {string[]} */
  const slugs = [];
  if (parts.length >= 2) {
    slugs.push(`${parts[0]}-${parts[1]}`);
    if (
      parts.length >= 3 &&
      parts[2].length >= 4 &&
      !PATH_STOP.has(parts[2]) &&
      !ENV_SLUG_PARTS.has(parts[2])
    ) {
      slugs.push(`${parts[0]}-${parts[1]}-${parts[2]}`);
    }
  }
  if (parts.length >= 1 && parts[0].length >= 4 && !PATH_STOP.has(parts[0])) {
    slugs.push(parts[0]);
  }
  return [...new Set(slugs)];
}

/**
 * `bettr` relates to `bettr-promotion`; `api` does not relate to `api-docs` if we
 * only treat prefix when the shorter slug is a hyphen prefix of the longer.
 * @param {string} a
 * @param {string} b
 */
export function slugsRelated(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(`${short}-`);
}

/**
 * Strip env suffixes so `bettr-promotion-marketing` and `bettr-promotion-dev-unio`
 * collapse to the product feature `bettr-promotion`. Not a merge decision.
 * @param {string} slug
 */
export function canonicalizeSlug(slug) {
  const parts = (slug || '')
    .toLowerCase()
    .split('-')
    .filter(Boolean)
    .filter((p) => !ENV_SLUG_PARTS.has(p) && !PATH_STOP.has(p) && !isOpaqueSuffix(p));
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  if (parts.length === 1 && parts[0].length >= 4) return parts[0];
  return '';
}

/**
 * Canonical product features for a URL (e.g. bettr-promotion).
 * Used as model hints / candidate grouping — never as cluster id.
 * @param {string | undefined} url
 * @returns {string[]}
 */
export function canonicalProductKeys(url) {
  const keys = projectAffinityKeys(url);
  const out = new Set();
  for (const s of keys.slugs) {
    const c = canonicalizeSlug(s);
    if (c) out.add(c);
  }
  if (keys.loopbackKey) out.add(keys.loopbackKey);
  return [...out];
}

/**
 * @typedef {{ slugs: string[], prefixKey: string, loopbackKey: string }} Affinity
 */

/**
 * @param {string | undefined} url
 * @returns {Affinity}
 */
export function projectAffinityKeys(url) {
  const empty = { slugs: [], prefixKey: '', loopbackKey: '' };
  if (!url || shouldSkipUrl(url)) return empty;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return empty;

    /** @type {string[]} */
    const slugs = [];
    const labels = u.hostname.toLowerCase().split('.').filter(Boolean);
    // Skip registrable tail (last two labels) so marmot-cloud.com is not a product.
    const subLabels = labels.length > 2 ? labels.slice(0, -2) : [];
    for (const lab of subLabels) {
      if (HOST_STOP.has(lab)) continue;
      slugs.push(...slugsFromToken(lab));
    }

    const pathSegs = u.pathname.split('/').filter(Boolean);
    for (const raw of pathSegs) {
      let seg = raw;
      try {
        seg = decodeURIComponent(raw);
      } catch {
        /* keep */
      }
      const lower = seg.toLowerCase();
      if (PATH_STOP.has(lower) || isIdLikeSegment(lower) || isOpaqueSuffix(lower)) continue;
      if (lower.includes('-')) slugs.push(...slugsFromToken(lower));
      else if (lower.length >= 5 && !PATH_STOP.has(lower)) slugs.push(lower);
    }

    const meaningful = pathSegs
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      })
      .map((s) => s.toLowerCase())
      .filter(
        (s) =>
          s &&
          !isIdLikeSegment(s) &&
          !isOpaqueSuffix(s) &&
          !GENERIC_PREFIX_SEG.has(s),
      );
    const prefixKey =
      meaningful.length >= 2 ? `${u.origin.toLowerCase()}/${meaningful[0]}/${meaningful[1]}` : '';

    // localhost / 127.0.0.1 / ::1 on the same port are one local app.
    const loopbackKey = isLoopbackHost(u.hostname)
      ? `loopback:${u.port || (u.protocol === 'https:' ? '443' : '80')}`
      : '';

    return { slugs: [...new Set(slugs)], prefixKey, loopbackKey };
  } catch {
    return empty;
  }
}

/**
 * @param {string | undefined} urlA
 * @param {string | undefined} urlB
 */
export function sharesProjectAffinity(urlA, urlB) {
  const a = projectAffinityKeys(urlA);
  const b = projectAffinityKeys(urlB);
  if (a.loopbackKey && a.loopbackKey === b.loopbackKey) return true;
  if (a.prefixKey && a.prefixKey === b.prefixKey) return true;
  // Both have a repo/product prefix and they differ → different products on the same host.
  if (a.prefixKey && b.prefixKey && a.prefixKey !== b.prefixKey) return false;
  for (const s of a.slugs) {
    for (const t of b.slugs) {
      if (slugsRelated(s, t)) return true;
    }
  }
  return false;
}

/**
 * Human title from the canonical product key only.
 * Never appends Unio / Marketing / env into the cluster name.
 * @param {{ url?: string, title?: string }[]} nodes
 */
export function projectDisplayName(nodes) {
  const list = nodes || [];
  /** @type {Map<string, number>} */
  const scores = new Map();
  let loopback = '';
  for (const n of list) {
    const keys = projectAffinityKeys(n.url);
    if (keys.loopbackKey) loopback = keys.loopbackKey;
    for (const raw of canonicalProductKeys(n.url)) {
      if (raw.startsWith('loopback:')) continue;
      if (!raw.includes('-')) continue;
      scores.set(raw, (scores.get(raw) || 0) + 1);
    }
  }

  let best = '';
  let bestScore = 0;
  for (const [slug, n] of scores) {
    if (n > bestScore || (n === bestScore && slug.length > best.length)) {
      best = slug;
      bestScore = n;
    }
  }
  if (best) return titleCaseSlug(best);
  if (loopback) return '本地应用';
  return '';
}

/** @param {string} slug */
export function titleCaseSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
