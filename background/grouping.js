/**
 * Semantic tab grouping by page-body topic labels → chrome.tabGroups.
 */
import { GROUP_COLORS, MAX_BODY_CHARS } from '../shared/constants.js';
import { getSettings } from '../shared/storage.js';
import { shouldSkipUrl } from '../shared/url-utils.js';
import { classifyPage } from './classifier.js';

/** label(lower) → color index assignment cache per window session */
const labelColorIndex = new Map();

/**
 * Extract readable text from a tab via content script message, with executeScript fallback.
 * @param {number} tabId
 * @returns {Promise<{ title: string, text: string, url: string } | null>}
 */
export async function extractPageContent(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE' });
    if (res?.ok) {
      return {
        title: res.title || '',
        text: (res.text || '').slice(0, MAX_BODY_CHARS),
        url: res.url || '',
      };
    }
  } catch {
    /* content script may not be injected yet */
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractInPage,
      args: [MAX_BODY_CHARS],
    });
    return result || null;
  } catch (err) {
    console.warn('[SmartTabPilot] extract failed for tab', tabId, err);
    return null;
  }
}

/**
 * Injected fallback — compact text snapshot (no imports).
 * Same spirit as content/extract.js / page-agent text-DOM: landmarks + headings,
 * strip nav/footer noise, hard cap. Not a full page-agent port.
 */
function extractInPage(maxChars) {
  const title = (document.title || '').trim();
  const contentSels = [
    'article', 'main', '[role="main"]', '[role="article"]',
    '#content', '#main', '.content', '.post', '.article', '.entry-content', '.markdown-body',
  ];
  const noiseSels = [
    'nav', 'header', 'footer', 'aside', 'menu',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
    'script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'form',
    '.nav', '.navbar', '.menu', '.sidebar', '.footer', '.header',
    '.cookie', '.cookie-banner', '#cookie', '[aria-hidden="true"]',
  ];
  let root = null;
  for (const sel of contentSels) {
    const el = document.querySelector(sel);
    if (el) { root = el; break; }
  }
  root = root || document.body;
  if (!root) return { title, text: '', url: location.href };

  const clone = root.cloneNode(true);
  for (const sel of noiseSels) {
    clone.querySelectorAll(sel).forEach((n) => n.remove());
  }

  const parts = [];
  if (title) parts.push(title);
  root.querySelectorAll('h1, h2, h3').forEach((h) => {
    if (h.closest(noiseSels.join(','))) return;
    const t = (h.innerText || '').replace(/\s+/g, ' ').trim();
    if (t) parts.push(t);
  });

  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const raw = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (!raw || raw.length < 2) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || /^(H1|H2|H3)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    const t = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (t) parts.push(t);
    node = walker.nextNode();
  }

  const deduped = [];
  for (const p of parts) {
    if (deduped.length && deduped[deduped.length - 1] === p) continue;
    deduped.push(p);
  }
  let text = deduped.join('\n').trim();
  if (text.length > maxChars) text = text.slice(0, maxChars);
  return { title, text, url: location.href };
}

/**
 * Find or create a tab group in the window whose title matches label.
 * @param {number} windowId
 * @param {string} label
 * @param {number[]} tabIds
 */
export async function placeTabsInGroup(windowId, label, tabIds) {
  if (!tabIds.length) return;

  const groups = await chrome.tabGroups.query({ windowId });
  const existing = groups.find(
    (g) => (g.title || '').trim().toLowerCase() === label.trim().toLowerCase(),
  );

  if (existing) {
    await chrome.tabs.group({ groupId: existing.id, tabIds });
    if ((existing.title || '') !== label) {
      await chrome.tabGroups.update(existing.id, { title: label });
    }
    return existing.id;
  }

  const color = pickColor(label);
  const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
  await chrome.tabGroups.update(groupId, { title: label, color, collapsed: false });
  return groupId;
}

/** @param {string} label */
function pickColor(label) {
  const key = label.trim().toLowerCase();
  if (!labelColorIndex.has(key)) {
    labelColorIndex.set(key, labelColorIndex.size % GROUP_COLORS.length);
  }
  return GROUP_COLORS[labelColorIndex.get(key)];
}

/**
 * Classify one tab and move it into the matching group.
 * @param {chrome.tabs.Tab} tab
 * @returns {Promise<{ ok: boolean, label?: string, source?: string, reason?: string }>}
 */
export async function groupSingleTab(tab) {
  if (tab.id == null || tab.windowId == null) {
    return { ok: false, reason: 'invalid-tab' };
  }
  if (shouldSkipUrl(tab.url)) {
    return { ok: false, reason: 'skipped-url' };
  }

  const content = await extractPageContent(tab.id);
  const page = content || {
    title: tab.title || '',
    text: '',
    url: tab.url || '',
  };

  const { label, source } = await classifyPage(page);
  await placeTabsInGroup(tab.windowId, label, [tab.id]);
  return { ok: true, label, source };
}

/**
 * Auto-group after a tab finishes loading (debounced lightly per tab).
 * @param {number} tabId
 */
const pendingGroup = new Map();

export function scheduleAutoGroup(tabId) {
  const prev = pendingGroup.get(tabId);
  if (prev) clearTimeout(prev);
  pendingGroup.set(
    tabId,
    setTimeout(async () => {
      pendingGroup.delete(tabId);
      const settings = await getSettings();
      if (!settings.autoSemanticGroupEnabled) return;
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || tab.status !== 'complete') return;
        await groupSingleTab(tab);
      } catch (err) {
        console.warn('[SmartTabPilot] auto-group error', err);
      }
    }, 800),
  );
}

/**
 * Group every eligible tab in a window; coalesce same labels.
 * @param {number} windowId
 */
export async function groupCurrentWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  /** @type {Map<string, { tabIds: number[], source: string }>} */
  const byLabel = new Map();
  /** @type {{ tabId: number, label: string, source: string }[]} */
  const results = [];

  for (const tab of tabs) {
    if (tab.id == null || shouldSkipUrl(tab.url)) continue;
    const content = await extractPageContent(tab.id);
    const page = content || {
      title: tab.title || '',
      text: '',
      url: tab.url || '',
    };
    const { label, source } = await classifyPage(page);
    const key = label.toLowerCase();
    if (!byLabel.has(key)) byLabel.set(key, { tabIds: [], source });
    byLabel.get(key).tabIds.push(tab.id);
    results.push({ tabId: tab.id, label, source });
  }

  for (const [key, { tabIds }] of byLabel) {
    // Prefer original casing from first result
    const label = results.find((r) => r.label.toLowerCase() === key)?.label || key;
    await placeTabsInGroup(windowId, label, tabIds);
  }

  return {
    ok: true,
    grouped: results.length,
    labels: [...new Set(results.map((r) => r.label))],
    sources: results.reduce((acc, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1;
      return acc;
    }, /** @type {Record<string, number>} */ ({})),
  };
}
