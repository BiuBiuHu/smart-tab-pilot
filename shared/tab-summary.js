/**
 * Short per-tab summary: title + key path/product slug + optional 1–2 sentences.
 * Full page bodies are never persisted.
 */
import {
  TAB_SUMMARY_EXCERPT_MAX,
  TAB_SUMMARY_STORE_CAP,
  TAB_SUMMARY_TITLE_MAX,
} from './constants.js';
import { canonicalProductKeys, projectAffinityKeys } from './project-affinity.js';

/**
 * @typedef {{
 *   title: string,
 *   url: string,
 *   pathKey: string,
 *   slugs: string[],
 *   productKeys: string[],
 *   excerpt: string,
 *   extractedAt: number,
 * }} TabSummary
 */

/** @param {string} s @param {number} max */
export function clipText(s, max) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim();
}

/**
 * First 1–2 sentences, hard-capped. Empty if no usable extract.
 * @param {string | undefined} text
 * @param {number} [maxSentences]
 * @param {number} [maxChars]
 */
export function excerptSentences(text, maxSentences = 2, maxChars = TAB_SUMMARY_EXCERPT_MAX) {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const parts = cleaned
    .split(/(?<=[。！？.!?])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
  const picked = (parts.length ? parts.slice(0, maxSentences) : [cleaned]).join(' ');
  return clipText(picked, maxChars);
}

/**
 * Stable path / product key for rules and later analysis.
 * @param {string | undefined} url
 */
export function summaryPathKey(url) {
  const keys = projectAffinityKeys(url);
  if (keys.prefixKey) return keys.prefixKey;
  if (keys.loopbackKey) return keys.loopbackKey;
  if (keys.slugs.length) return keys.slugs[0];
  try {
    const u = new URL(url || '');
    const seg = u.pathname.split('/').filter(Boolean)[0] || '';
    return seg ? `${u.origin.toLowerCase()}/${seg.toLowerCase()}` : u.origin.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * @param {{ title?: string, url?: string, text?: string, extractedAt?: number }} input
 * @returns {TabSummary}
 */
export function buildTabSummary(input) {
  const url = input.url || '';
  const keys = projectAffinityKeys(url);
  return {
    title: clipText(input.title || '', TAB_SUMMARY_TITLE_MAX),
    url,
    pathKey: summaryPathKey(url),
    slugs: keys.slugs.slice(0, 6),
    productKeys: canonicalProductKeys(url).slice(0, 6),
    excerpt: excerptSentences(input.text || ''),
    extractedAt: input.extractedAt ?? Date.now(),
  };
}

/**
 * True when a stored summary belongs to a different page (must refresh).
 * @param {TabSummary | null | undefined} summary
 * @param {string | undefined} url
 */
export function summaryIsStale(summary, url) {
  if (!summary) return true;
  const a = (summary.url || '').split('#')[0];
  const b = (url || '').split('#')[0];
  return !a || !b || a !== b;
}

/**
 * Drop oldest entries when over cap. Mutates a copy.
 * @param {Record<string, TabSummary>} store
 * @param {number} [cap]
 */
export function capSummaryStore(store, cap = TAB_SUMMARY_STORE_CAP) {
  const entries = Object.entries(store || {});
  if (entries.length <= cap) return { ...store };
  entries.sort((a, b) => (a[1]?.extractedAt || 0) - (b[1]?.extractedAt || 0));
  const keep = entries.slice(entries.length - cap);
  return Object.fromEntries(keep);
}

/**
 * Compact line for model prompts / debug — never includes a full body.
 * @param {TabSummary | null | undefined} s
 */
export function formatSummaryLine(s) {
  if (!s) return '';
  const slug =
    (s.productKeys || []).slice(0, 2).join(',') ||
    (s.slugs || []).slice(0, 3).join(',') ||
    s.pathKey ||
    '';
  const bits = [s.title, slug, s.excerpt].filter(Boolean);
  return clipText(bits.join(' · '), TAB_SUMMARY_TITLE_MAX + TAB_SUMMARY_EXCERPT_MAX + 40);
}
