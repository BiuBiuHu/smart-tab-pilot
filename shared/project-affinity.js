/**
 * Project affinity FEATURES and obvious same-product identity.
 * Slug-related / loopback keys may propose pairs for the model judge.
 * Exact project path (origin + two meaningful segs) and a shared distinctive
 * product name in title/URL identity positions are conservative unions —
 * they do not need opener/referrer, and they are not a domain allow/deny list.
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
 * @param {string} token
 * @param {Set<string>} [into]
 * @returns {boolean}
 */
function addIdentityAtom(into, token) {
  const t = (token || '').toLowerCase();
  if (!t || t.length < 3) return false;
  if (HOST_STOP.has(t) || PATH_STOP.has(t) || ENV_SLUG_PARTS.has(t) || GENERIC_PREFIX_SEG.has(t)) {
    return false;
  }
  into.add(t);
  return true;
}

/**
 * Hyphenated product slugs only — never the unhyphenated prefix (`bettr` from
 * `bettr-promotion`), which is too weak for conservative unions.
 * @param {string} token
 * @param {Set<string>} into
 */
function addHyphenatedSlugs(token, into) {
  if (!token || !token.includes('-')) return;
  for (const slug of slugsFromToken(token)) {
    if (!slug.includes('-')) continue;
    addIdentityAtom(into, slug);
    const canon = canonicalizeSlug(slug);
    if (canon && canon.includes('-')) addIdentityAtom(into, canon);
  }
}

/**
 * URL identity: subdomain labels + path segments + hyphenated product slugs.
 * Two-label SLD (`react.dev` → react) is separate — it must not glue every
 * github.com tab together, but it SHOULD match a repo/path named `react`.
 * @param {string | undefined} url
 * @returns {{ strong: Set<string>, sld: Set<string> }}
 */
export function urlIdentityParts(url) {
  const empty = { strong: new Set(), sld: new Set() };
  if (!url || shouldSkipUrl(url)) return empty;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return empty;
    /** @type {Set<string>} */
    const strong = new Set();
    /** @type {Set<string>} */
    const sld = new Set();
    const labels = u.hostname.toLowerCase().split('.').filter(Boolean);
    if (!isLoopbackHost(u.hostname)) {
      if (labels.length === 2) {
        addIdentityAtom(sld, labels[0]);
      } else if (labels.length > 2) {
        for (const lab of labels.slice(0, -2)) {
          if (!lab || lab === 'www' || HOST_STOP.has(lab) || /^\d+$/.test(lab)) continue;
          addIdentityAtom(strong, lab);
          addHyphenatedSlugs(lab, strong);
        }
      }
    }
    for (const raw of u.pathname.split('/').filter(Boolean)) {
      let seg = raw;
      try {
        seg = decodeURIComponent(raw);
      } catch {
        /* keep */
      }
      const lower = seg.toLowerCase();
      if (!lower || isIdLikeSegment(lower) || isOpaqueSuffix(lower)) continue;
      if (PATH_STOP.has(lower) || GENERIC_PREFIX_SEG.has(lower)) continue;
      if (/\.[a-z0-9]{1,5}$/i.test(lower)) continue;
      addIdentityAtom(strong, lower);
      addHyphenatedSlugs(lower, strong);
    }
    return { strong, sld };
  } catch {
    return empty;
  }
}

/**
 * Title identity tokens (whole words / owner-repo / hyphenated product slugs).
 * @param {string | undefined} title
 * @returns {Set<string>}
 */
export function titleIdentityAtoms(title) {
  /** @type {Set<string>} */
  const atoms = new Set();
  const raw = (title || '').trim();
  if (!raw) return atoms;
  const repo = raw.match(/\b[A-Za-z0-9._-]+\/([A-Za-z0-9._-]+)/);
  if (repo) addIdentityAtom(atoms, repo[1]);
  const words = raw.toLowerCase().match(/[a-z][a-z0-9-]{2,}|[\u4e00-\u9fff]{2,}/g) || [];
  for (const w of words) {
    addIdentityAtom(atoms, w);
    addHyphenatedSlugs(w, atoms);
  }
  return atoms;
}

/**
 * Leading product-like name: `Nod - …`, `acme/zed: …`, `bettr-promotion · Marmot`.
 * @param {string | undefined} title
 */
export function leadingTitleAtom(title) {
  const raw = (title || '').trim();
  if (!raw) return '';
  const lead = raw.split(/\s*(?:[:|·—]| - )\s*/)[0] || raw;
  const repo = lead.match(/^[A-Za-z0-9._-]+\/([A-Za-z0-9._-]+)/);
  if (repo) {
    const t = repo[1].toLowerCase();
    return t.length >= 3 && !PATH_STOP.has(t) && !HOST_STOP.has(t) ? t : '';
  }
  const word = lead.toLowerCase().match(/[a-z][a-z0-9-]{2,}|[\u4e00-\u9fff]{2,}/);
  const t = word ? word[0] : '';
  if (!t || PATH_STOP.has(t) || HOST_STOP.has(t) || ENV_SLUG_PARTS.has(t)) return '';
  return t;
}

/**
 * Unhyphenated `bettr` is weak on a page that also has `bettr-promotion`.
 * Hyphenated product slugs stay strong even when a longer env host exists
 * (`bettr-promotion` vs `bettr-promotion-dev-unio`).
 * @param {string} token
 * @param {Set<string>} atoms
 */
function isWeakPrefixAtom(token, atoms) {
  if (!token || token.includes('-')) return false;
  for (const other of atoms) {
    if (other !== token && other.startsWith(`${token}-`)) return true;
  }
  return false;
}

/**
 * Origin + first two path segments, keeping opaque repo names (`k8s-net`).
 * Distinguishes different products on the same host; not a merge key by itself
 * when one side has no such path.
 * @param {string} url
 */
function repoStyleKey(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const segs = u.pathname
      .split('/')
      .filter(Boolean)
      .map((raw) => {
        try {
          return decodeURIComponent(raw).toLowerCase();
        } catch {
          return raw.toLowerCase();
        }
      })
      .filter((s) => s && !PATH_STOP.has(s) && !GENERIC_PREFIX_SEG.has(s) && !/^\d+$/.test(s));
    if (segs.length >= 2) return `${u.origin.toLowerCase()}/${segs[0]}/${segs[1]}`;
    return '';
  } catch {
    return '';
  }
}

/**
 * @param {{ url?: string, title?: string, summary?: { url?: string, title?: string } } | null | undefined} node
 */
function nodeUrlTitle(node) {
  return {
    url: node?.url || node?.summary?.url || '',
    title: node?.title || node?.summary?.title || '',
  };
}

/**
 * Obvious same-class / same-product pages. Navigation is irrelevant.
 * True for GitHub repo + official site sharing a distinctive product name,
 * or the same origin+two-seg project path. False for license pages, env
 * consoles, different repos, and docs that only mention a product.
 * @param {{ url?: string, title?: string, summary?: { url?: string, title?: string } } | null | undefined} nodeA
 * @param {{ url?: string, title?: string, summary?: { url?: string, title?: string } } | null | undefined} nodeB
 */
export function obviousSameProduct(nodeA, nodeB) {
  const a = nodeUrlTitle(nodeA);
  const b = nodeUrlTitle(nodeB);
  if (!a.url || !b.url || a.url === b.url) return false;

  const affA = projectAffinityKeys(a.url);
  const affB = projectAffinityKeys(b.url);
  if (affA.prefixKey && affA.prefixKey === affB.prefixKey) return true;

  let originA = '';
  let originB = '';
  try {
    originA = new URL(a.url).origin.toLowerCase();
  } catch {
    /* ignore */
  }
  try {
    originB = new URL(b.url).origin.toLowerCase();
  } catch {
    /* ignore */
  }
  const repoA = repoStyleKey(a.url);
  const repoB = repoStyleKey(b.url);
  if (originA && originA === originB && repoA && repoB && repoA !== repoB) {
    return false;
  }
  if (
    originA &&
    originA === originB &&
    affA.prefixKey &&
    affB.prefixKey &&
    affA.prefixKey !== affB.prefixKey
  ) {
    return false;
  }

  const idA = urlIdentityParts(a.url);
  const idB = urlIdentityParts(b.url);
  const titleA = titleIdentityAtoms(a.title);
  const titleB = titleIdentityAtoms(b.title);

  for (const t of idA.strong) {
    if (idB.strong.has(t) && !isWeakPrefixAtom(t, idA.strong) && !isWeakPrefixAtom(t, idB.strong)) {
      return true;
    }
  }
  for (const t of idA.sld) {
    if (idB.strong.has(t) && !isWeakPrefixAtom(t, idB.strong)) return true;
  }
  for (const t of idB.sld) {
    if (idA.strong.has(t) && !isWeakPrefixAtom(t, idA.strong)) return true;
  }
  if (originA && originA === originB) {
    for (const t of idA.sld) {
      if (idB.sld.has(t)) return true;
    }
  }

  for (const t of idA.strong) {
    if (isWeakPrefixAtom(t, idA.strong)) continue;
    if (titleB.has(t)) return true;
  }
  for (const t of idB.strong) {
    if (isWeakPrefixAtom(t, idB.strong)) continue;
    if (titleA.has(t)) return true;
  }

  const leadA = leadingTitleAtom(a.title);
  const leadB = leadingTitleAtom(b.title);
  if (leadA && leadA === leadB && leadA.length >= 4) {
    if (
      idA.strong.has(leadA) ||
      idB.strong.has(leadA) ||
      idA.sld.has(leadA) ||
      idB.sld.has(leadA)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Human title from the canonical product key only.
 * Never appends Unio / Marketing / env into the cluster name.
 * 「本地应用」 is only for a homogeneous same-port loopback cluster — a mixed
 * bag of local ports, or loopback + remote pages, is not a task name.
 * @param {{ url?: string, title?: string }[]} nodes
 */
export function projectDisplayName(nodes) {
  const list = nodes || [];
  /** @type {Map<string, number>} */
  const scores = new Map();
  /** @type {Set<string>} */
  const loopbackKeys = new Set();
  let hasNonLoopback = false;
  for (const n of list) {
    const keys = projectAffinityKeys(n.url);
    if (keys.loopbackKey) loopbackKeys.add(keys.loopbackKey);
    else if (n?.url) hasNonLoopback = true;
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
  const mixedLoopback = loopbackKeys.size > 1 || (loopbackKeys.size >= 1 && hasNonLoopback);
  if (mixedLoopback) return '';
  if (loopbackKeys.size === 1) return '本地应用';
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
