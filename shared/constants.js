/** Shared defaults and constants for Smart Tab Pilot. */

export const DEFAULT_SETTINGS = {
  /** Exact URL match including hash when false (product default). */
  ignoreHash: false,
  /** Close new tab and activate existing duplicate (all windows). */
  exactDedupeEnabled: true,
  /** Auto classify + place into tabGroups on navigation complete. */
  autoSemanticGroupEnabled: true,
  /**
   * Quick search UI (P1 / ahead-of-scope). Default off for MVP so search is not
   * implied as a required acceptance path; leave code paths intact.
   */
  quickSearchEnabled: false,
  /**
   * Side panel task view + batch grouping scope.
   * true = 全部窗口（default）；false = 仅当前窗口.
   */
  allWindowsViewEnabled: true,
  /** OpenAI-compatible fallback. */
  customBaseUrl: '',
  customApiKey: '',
  customModel: 'gpt-4o-mini',
};

/**
 * 任务导航图（navigation graph learning）constants.
 * Strong opener / medium time / weak learned-prior + semantic refine.
 */
export const TIME_ADJACENCY_MS = 45_000;
export const LEARNED_UNION_THRESHOLD = 0.35;
export const NAV_PRIORS_STORAGE_KEY = 'navPriors';
export const NAV_PRIORS_CAP = 2000;
export const SESSION_LINEAGE_KEY = 'tabLineage';
export const SESSION_FEEDBACK_KEY = 'taskFeedbackEdges';
export const LABEL_CACHE_KEY = 'taskLabelCache';

/** Per-tab extract / classify must fail-soft so 「立即整理」 cannot hang. */
export const EXTRACT_TIMEOUT_MS = 2000;
export const CLASSIFY_TIMEOUT_MS = 2500;
/** First-pass GROUP_TABS (quick cluster) backstop. Refine uses progress + stall. */
export const GROUP_RPC_TIMEOUT_MS = 20_000;
/** No progress heartbeat for this long → treat refine as stalled and recover the button. */
export const REFINE_STALL_MS = 12_000;
/** Relabel physical groups every N refined tabs (not a stop cap). */
export const LABEL_REFRESH_RELABEL_EVERY = 6;
export const LABEL_REFRESH_CONCURRENCY = 3;

/** Typed edge weights (documentation + feedback deltas). */
export const EDGE_WEIGHT = {
  OPENER: 1,
  REFERRER: 0.75,
  TIME: 0.45,
  LEARNED_OPENER_DELTA: 0.2,
  LEARNED_TIME_DELTA: 0.05,
  FEEDBACK_MERGE_DELTA: 0.35,
  FEEDBACK_SPLIT_DELTA: -0.5,
};

export const SKIP_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'edge://',
  'devtools://',
  'view-source:',
];

export const MAX_BODY_CHARS = 4000;

/** Cap for recently-closed list in chrome.storage.local */
export const RECENT_CLOSED_CAP = 200;
export const RECENT_CLOSED_STORAGE_KEY = 'recentClosedTabs';

/** chrome.tabGroups.ColorEnum cycle */
export const GROUP_COLORS = [
  'blue',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'cyan',
  'grey',
];

/**
 * Topic labels must come from page body/title semantics — never from domain/site brand.
 * Same host with different topics MUST yield different labels (no domain aggregation).
 */
export const CLASSIFY_SYSTEM_PROMPT = `You are a tab topic classifier for browser tab groups.
Given a page title and body excerpt, reply with ONLY a short topic label (2–8 words).
Rules:
- Label the ARTICLE / PAGE TOPIC from the body and title content.
- NEVER use the website name, brand, hostname, or domain as the label (e.g. do not answer "GitHub", "Wikipedia", "知乎", "Medium").
- If two pages share the same site but discuss different topics, they MUST get different labels.
- Use Chinese if the page is mainly Chinese; otherwise English.
- No quotes, no punctuation at the end, no explanation.`;

export const MSG = {
  GET_NANO_STATUS: 'GET_NANO_STATUS',
  DOWNLOAD_NANO: 'DOWNLOAD_NANO',
  GROUP_CURRENT_WINDOW: 'GROUP_CURRENT_WINDOW',
  GROUP_TABS: 'GROUP_TABS',
  GET_TASK_VIEW: 'GET_TASK_VIEW',
  TASK_FEEDBACK: 'TASK_FEEDBACK',
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  EXTRACT_RESULT: 'EXTRACT_RESULT',
  EXTRACT_PAGE: 'EXTRACT_PAGE',
  TAB_NAV_HINT: 'TAB_NAV_HINT',
  SEARCH_TABS: 'SEARCH_TABS',
  ACTIVATE_SEARCH_RESULT: 'ACTIVATE_SEARCH_RESULT',
  GROUP_PROGRESS: 'GROUP_PROGRESS',
  GROUP_REFINE_DONE: 'GROUP_REFINE_DONE',
};
