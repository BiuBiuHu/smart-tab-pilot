/**
 * Task-aware grouping: 任务导航图 clusters → per-window chrome.tabGroups.
 * Cross-window clusters are logical only; physical groups stay in one windowId.
 */
import { withTimeout } from '../shared/async-timeout.js';
import {
  CLASSIFY_TIMEOUT_MS,
  EXTRACT_TIMEOUT_MS,
  GROUP_COLORS,
  LABEL_CACHE_KEY,
  LABEL_REFRESH_CONCURRENCY,
  LABEL_REFRESH_RELABEL_EVERY,
  MODEL_JUDGE_TIMEOUT_MS,
  MSG,
  TAB_SUMMARY_SOURCE_CHARS,
  TIME_ADJACENCY_MS,
} from '../shared/constants.js';
import { heuristicLabel, sanitizeLabel } from '../shared/label-utils.js';
import { applyModelJudgment, buildJudgePayload } from '../shared/model-group-judge.js';
import {
  extraTabIdsToFold,
  pickReusableGroupId,
  coalesceWindowPlacements,
} from '../shared/physical-groups.js';
import { getSettings } from '../shared/storage.js';
import { listUncachedEligibleTabs } from '../shared/refine-queue.js';
import { buildTaskClusters } from '../shared/task-graph.js';
import { shouldSkipUrl } from '../shared/url-utils.js';
import { classifyPage, tryModelSameGroupJudge } from './classifier.js';
import { loadPriors, loadSessionFeedback, recordModelMerges } from './nav-memory.js';
import { attachLineage, hydrateLineage, patchLineage } from './tab-lineage.js';
import {
  getTabSummary,
  hydrateTabSummaries,
  upsertTabSummary,
} from './tab-summaries.js';

/** label(lower) → color index assignment cache per session */
const labelColorIndex = new Map();

/** @type {Map<number, { label: string, source: string }>} */
const labelCache = new Map();

async function persistLabelCache() {
  const obj = /** @type {Record<string, { label: string, source: string }>} */ ({});
  for (const [id, v] of labelCache) obj[String(id)] = v;
  try {
    await chrome.storage.session.set({ [LABEL_CACHE_KEY]: obj });
  } catch {
    /* ignore */
  }
}

export async function hydrateLabelCache() {
  try {
    const bag = await chrome.storage.session.get(LABEL_CACHE_KEY);
    const raw = bag[LABEL_CACHE_KEY];
    if (!raw || typeof raw !== 'object') return;
    for (const [k, v] of Object.entries(raw)) {
      const id = Number(k);
      if (Number.isFinite(id) && v && typeof v.label === 'string') {
        labelCache.set(id, { label: v.label, source: v.source || 'heuristic' });
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Extract readable text from a tab via content script message, with executeScript fallback.
 * @param {number} tabId
 * @returns {Promise<{ title: string, text: string, url: string } | null>}
 */
export async function extractPageContent(tabId) {
  return withTimeout(extractPageContentUnbound(tabId), EXTRACT_TIMEOUT_MS, null);
}

/** @param {number} tabId */
async function extractPageContentUnbound(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: MSG.EXTRACT_PAGE });
    if (res?.ok) {
      return {
        title: res.title || '',
        text: (res.text || '').slice(0, TAB_SUMMARY_SOURCE_CHARS),
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
      args: [TAB_SUMMARY_SOURCE_CHARS],
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
 * Place tabs into a physical group in ONE window.
 * Same normalized title → one group. Never create a second 「LinkE」 in the same window.
 * @param {number} windowId
 * @param {string} label
 * @param {number[]} tabIds
 */
export async function placeTabsInGroup(windowId, label, tabIds) {
  if (!tabIds.length) return;

  const tabs = await chrome.tabs.query({ windowId });
  const inWindow = tabIds.filter((id) => tabs.some((t) => t.id === id));
  if (!inWindow.length) return;
  const none = chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1;

  /** @type {{ id: number, title?: string }[]} */
  let groups = [];
  try {
    groups = await chrome.tabGroups.query({ windowId });
  } catch {
    groups = [];
  }

  const reusable = pickReusableGroupId({
    groups,
    windowTabs: tabs,
    tabIds: inWindow,
    label,
    noneId: none,
  });
  const fold = extraTabIdsToFold({
    groups,
    windowTabs: tabs,
    label,
    already: inWindow,
  });
  const allIds = [...new Set([...inWindow, ...fold])];

  const groupId =
    reusable != null
      ? (await chrome.tabs.group({ groupId: reusable, tabIds: allIds }), reusable)
      : await chrome.tabs.group({ tabIds: allIds, createProperties: { windowId } });

  const color = pickColor(label);
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

/** @param {chrome.tabs.Tab} tab */
function titleHeuristic(tab) {
  return {
    label: sanitizeLabel(heuristicLabel(tab.title || '', '', tab.url || '')),
    source: 'heuristic',
  };
}

/**
 * Classify one tab (timed extract + timed model). Always fail-soft to title heuristic.
 * @param {chrome.tabs.Tab} tab
 */
async function classifyAndCache(tab) {
  try {
    const content = await extractPageContent(tab.id);
    const page = content || {
      title: tab.title || '',
      text: '',
      url: tab.url || '',
    };
    const result = await withTimeout(classifyPage(page), CLASSIFY_TIMEOUT_MS, null);
    const final = result || {
      label: sanitizeLabel(heuristicLabel(page.title || '', page.text || '', page.url || '')),
      source: 'heuristic',
    };
    labelCache.set(tab.id, final);
    upsertTabSummary(tab.id, page);
    void persistLabelCache();
    return final;
  } catch {
    const fallback = titleHeuristic(tab);
    if (tab.id != null) {
      labelCache.set(tab.id, fallback);
      void persistLabelCache();
    }
    return fallback;
  }
}

/**
 * @param {chrome.tabs.Tab} tab
 * @param {boolean} fullExtract
 */
async function labelForTab(tab, fullExtract) {
  if (tab.id == null) return { label: '未分类', source: 'heuristic' };
  if (!fullExtract && labelCache.has(tab.id)) return labelCache.get(tab.id);
  if (fullExtract) return classifyAndCache(tab);
  const cached = labelCache.get(tab.id);
  if (cached) return cached;
  const label = sanitizeLabel(heuristicLabel(tab.title || '', '', tab.url || ''));
  return { label, source: 'heuristic' };
}

/**
 * @param {chrome.tabs.Tab[]} tabs
 * @param {{ fullExtract?: boolean, onlyTabId?: number }} [opts]
 */
async function nodesFromTabs(tabs, opts = {}) {
  await hydrateLineage();
  await hydrateLabelCache();
  await hydrateTabSummaries();
  const attached = attachLineage(tabs);
  const nodes = [];
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    if (tab.id == null || shouldSkipUrl(tab.url || attached[i].url)) continue;
    const full = opts.fullExtract === true || opts.onlyTabId === tab.id;
    const { label, source } = await labelForTab(tab, full);
    const url = attached[i].url || tab.url || '';
    let summary = getTabSummary(tab.id);
    if (!summary || summary.url !== url) {
      summary = upsertTabSummary(tab.id, {
        title: tab.title || attached[i].title || '',
        url,
        text: '',
      });
    }
    nodes.push({
      ...attached[i],
      id: tab.id,
      windowId: tab.windowId,
      semanticLabel: label,
      source,
      summary,
    });
  }
  return nodes;
}

/**
 * @param {import('../shared/task-graph.js').TaskNode[]} nodes
 */
async function clusterNodes(nodes, opts = {}) {
  const [priors, session] = await Promise.all([loadPriors(), loadSessionFeedback()]);
  const buildOpts = {
    timeWindowMs: TIME_ADJACENCY_MS,
    priors,
    sessionMerges: session.merges,
    sessionSplits: session.splits,
  };
  let clusters = buildTaskClusters(nodes, buildOpts);
  if (opts.useModelJudge) {
    clusters = await maybeApplyModelJudge(clusters, nodes, buildOpts);
  }
  return clusters;
}

/**
 * Second layer: model same-group on summaries. Fail-soft; never blocks rules.
 * @param {import('../shared/task-graph.js').TaskCluster[]} clusters
 * @param {import('../shared/task-graph.js').TaskNode[]} nodes
 * @param {object} buildOpts
 */
async function maybeApplyModelJudge(clusters, nodes, buildOpts) {
  if (!clusters || clusters.length < 2) return clusters;
  try {
    const summariesByTab = new Map(nodes.map((n) => [n.id, n.summary]));
    const payload = buildJudgePayload(clusters, summariesByTab);
    if (!payload.candidates.length) return clusters;
    const wanted = new Set(payload.candidates.flatMap((p) => [p.a, p.b]));
    payload.clusters = payload.clusters.filter((c) => wanted.has(c.id));
    const judgment = await withTimeout(
      tryModelSameGroupJudge(payload),
      MODEL_JUDGE_TIMEOUT_MS,
      null,
    );
    if (!judgment?.merges?.length) return clusters;
    await recordModelMerges(judgment.merges);
    return applyModelJudgment(nodes, clusters, judgment, buildOpts, buildTaskClusters);
  } catch (err) {
    console.warn('[SmartTabPilot] model same-group judge skipped', err);
    return clusters;
  }
}

/**
 * Apply physical chrome.tabGroups per window for each logical cluster.
 * @param {import('../shared/task-graph.js').TaskCluster[]} clusters
 * @param {import('../shared/task-graph.js').TaskNode[]} nodes
 */
async function applyPhysicalGroups(clusters, nodes) {
  for (const placement of coalesceWindowPlacements(clusters, nodes)) {
    try {
      await placeTabsInGroup(placement.windowId, placement.label, placement.tabIds);
    } catch (err) {
      console.warn('[SmartTabPilot] physical group failed', placement.windowId, err);
    }
  }
}

/**
 * Classify one tab and move it into its task cluster's per-window group.
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

  const all = await chrome.tabs.query({});
  const nodes = await nodesFromTabs(all, { onlyTabId: tab.id });
  const clusters = await clusterNodes(nodes, { useModelJudge: true });
  const mine = clusters.find((c) => c.tabIds.includes(tab.id));
  if (!mine) return { ok: false, reason: 'no-cluster' };

  const sameWindow = mine.tabIds.filter((id) => {
    const n = nodes.find((x) => x.id === id);
    return n && n.windowId === tab.windowId;
  });
  await placeTabsInGroup(tab.windowId, mine.label, sameWindow.length ? sameWindow : [tab.id]);
  const labeled = nodes.find((n) => n.id === tab.id);
  return { ok: true, label: mine.label, source: labeled?.source || 'heuristic' };
}

const pendingGroup = new Map();

/**
 * Auto-group after a tab finishes loading (debounced lightly per tab).
 * @param {number} tabId
 */
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
        if (shouldSkipUrl(tab.url)) return;
        await groupSingleTab(tab);
      } catch (err) {
        console.warn('[SmartTabPilot] auto-group error', err);
      }
    }, 800),
  );
}

/**
 * @param {Record<string, unknown>} payload
 */
function broadcastGroupProgress(payload) {
  try {
    chrome.runtime.sendMessage(
      { type: MSG.GROUP_PROGRESS, payload },
      () => void chrome.runtime.lastError,
    );
  } catch {
    /* no listener */
  }
}

/**
 * Timed extract + title/body heuristic for EVERY uncached eligible tab.
 * One hung page fails soft and the queue continues. chrome:// never enters.
 * @param {chrome.tabs.Tab[]} tabs
 * @param {import('../shared/task-graph.js').TaskNode[]} nodes
 * @param {{
 *   concurrency: number,
 *   relabelEvery?: number,
 *   onProgress?: (p: { done: number, total: number, phase: string }) => void,
 *   onRelabel?: (nodes: import('../shared/task-graph.js').TaskNode[]) => Promise<void>,
 * }} opts
 */
async function refreshUncachedLabels(tabs, nodes, opts) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const candidates = listUncachedEligibleTabs(tabs, labelCache.keys());
  const total = candidates.length;
  if (!total) return { done: 0, total: 0 };
  opts.onProgress?.({ done: 0, total, phase: 'refine' });

  let cursor = 0;
  let done = 0;
  let sinceRelabel = 0;
  let relabelChain = Promise.resolve();
  const relabelEvery = opts.relabelEvery ?? LABEL_REFRESH_RELABEL_EVERY;

  const worker = async () => {
    while (cursor < candidates.length) {
      const tab = candidates[cursor];
      cursor += 1;
      try {
        const content = await extractPageContent(tab.id);
        const title = content?.title || tab.title || '';
        const text = content?.text || '';
        const url = content?.url || tab.url || '';
        const labeled = {
          label: sanitizeLabel(heuristicLabel(title, text, url)),
          source: 'heuristic',
        };
        labelCache.set(tab.id, labeled);
        const summary = upsertTabSummary(tab.id, { title, url, text });
        const node = byId.get(tab.id);
        if (node) {
          node.semanticLabel = labeled.label;
          node.source = labeled.source;
          node.summary = summary;
        }
      } catch {
        if (tab.id != null && !labelCache.has(tab.id)) {
          const fallback = titleHeuristic(tab);
          labelCache.set(tab.id, fallback);
        }
      }
      done += 1;
      sinceRelabel += 1;
      opts.onProgress?.({ done, total, phase: 'refine' });
      if (opts.onRelabel && sinceRelabel >= relabelEvery) {
        sinceRelabel = 0;
        relabelChain = relabelChain
          .then(() => opts.onRelabel(nodes))
          .catch((err) => console.warn('[SmartTabPilot] mid-refine relabel failed', err));
        await relabelChain;
      }
    }
  };

  const n = Math.min(opts.concurrency, candidates.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  void persistLabelCache();
  return { done, total };
}

/**
 * @param {{ allWindows?: boolean, windowId?: number, applyPhysical?: boolean }} [opts]
 */
export async function groupTabs(opts = {}) {
  const applyPhysical = opts.applyPhysical !== false;
  let tabs;
  if (opts.allWindows === false && opts.windowId != null) {
    tabs = await chrome.tabs.query({ windowId: opts.windowId });
  } else if (opts.allWindows === false) {
    const current = await chrome.windows.getLastFocused();
    if (current?.id == null) return { ok: false, error: 'no-window' };
    tabs = await chrome.tabs.query({ windowId: current.id });
  } else {
    tabs = await chrome.tabs.query({});
  }

  // Pass 1: task graph for ALL eligible tabs (lineage / cache / title heuristic).
  const nodes = await nodesFromTabs(tabs, { fullExtract: false });
  let clusters = await clusterNodes(nodes);
  if (applyPhysical) {
    await applyPhysicalGroups(clusters, nodes);
  }

  const refineTotal = listUncachedEligibleTabs(tabs, labelCache.keys()).length;
  broadcastGroupProgress({
    done: 0,
    total: refineTotal,
    phase: 'quick',
    grouped: nodes.length,
    clusterCount: clusters.length,
  });

  // Pass 2: timed extract for every remaining uncached tab (no abandon cap).
  if (refineTotal > 0) {
    await refreshUncachedLabels(tabs, nodes, {
      concurrency: LABEL_REFRESH_CONCURRENCY,
      relabelEvery: LABEL_REFRESH_RELABEL_EVERY,
      onProgress: (p) => broadcastGroupProgress(p),
      onRelabel: applyPhysical
        ? async (fresh) => {
            const next = await clusterNodes(fresh);
            await applyPhysicalGroups(next, fresh);
          }
        : undefined,
    });
    clusters = await clusterNodes(nodes, { useModelJudge: true });
    if (applyPhysical) {
      await applyPhysicalGroups(clusters, nodes);
    }
    broadcastGroupProgress({ done: refineTotal, total: refineTotal, phase: 'done' });
  } else {
    clusters = await clusterNodes(nodes, { useModelJudge: true });
    if (applyPhysical) {
      await applyPhysicalGroups(clusters, nodes);
    }
  }

  const sources = nodes.reduce((acc, n) => {
    const s = n.source || 'heuristic';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));

  return {
    ok: true,
    grouped: nodes.length,
    refined: refineTotal,
    labels: [...new Set(clusters.map((c) => c.label))],
    sources,
    clusters,
  };
}

/**
 * Group every eligible tab in a window (compat wrapper).
 * @param {number} windowId
 */
export async function groupCurrentWindow(windowId) {
  return groupTabs({ allWindows: false, windowId });
}

/**
 * Logical task view for the side panel (no forced re-extract).
 * @param {{ allWindows?: boolean }} [opts]
 */
export async function getTaskView(opts = {}) {
  await hydrateLineage();
  await hydrateLabelCache();
  const allWindows = opts.allWindows !== false;
  const allTabs = await chrome.tabs.query({});
  let windowFilter = null;
  if (!allWindows) {
    const current = await chrome.windows.getLastFocused();
    windowFilter = current?.id ?? null;
  }

  const windows = await chrome.windows.getAll();
  const focusedId = (await chrome.windows.getLastFocused().catch(() => null))?.id;
  const windowOrder = windows.map((w) => w.id).sort((a, b) => a - b);
  const windowBadge = new Map();
  windowOrder.forEach((id, i) => {
    windowBadge.set(id, id === focusedId ? '当前' : `窗口 ${i + 1}`);
  });

  const eligible = allTabs.filter((t) => t.id != null && !shouldSkipUrl(t.url));
  const nodes = await nodesFromTabs(eligible, { fullExtract: false });
  const clusters = await clusterNodes(nodes, { useModelJudge: true });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const tabById = new Map(allTabs.map((t) => [t.id, t]));

  const viewClusters = clusters
    .map((c) => {
      const tabs = c.tabIds
        .map((id) => {
          const n = nodeById.get(id);
          const t = tabById.get(id);
          if (!n || !t) return null;
          if (windowFilter != null && n.windowId !== windowFilter) return null;
          return {
            tabId: id,
            windowId: n.windowId,
            windowBadge: windowBadge.get(n.windowId) || `窗口`,
            title: t.title || n.url || '',
            url: t.url || n.url || '',
            favIconUrl: t.favIconUrl || '',
            topic: n.semanticLabel || '',
          };
        })
        .filter(Boolean);
      return {
        id: c.id,
        label: c.label,
        edges: c.edges,
        windowIds: [...new Set(tabs.map((t) => t.windowId))],
        tabs,
      };
    })
    .filter((c) => c.tabs.length);

  return {
    ok: true,
    allWindows,
    currentWindowId: focusedId,
    clusters: viewClusters,
    tabCount: viewClusters.reduce((n, c) => n + c.tabs.length, 0),
  };
}

/**
 * Content-script navigation hint (document.referrer as click-source fallback).
 * @param {number | undefined} tabId
 * @param {{ url?: string, referrer?: string }} hint
 */
export function applyNavHint(tabId, hint) {
  if (tabId == null) return;
  const patch = {};
  if (hint.url) patch.url = hint.url;
  if (hint.referrer) patch.referrerUrl = hint.referrer;
  if (Object.keys(patch).length) patchLineage(tabId, patch);
}
