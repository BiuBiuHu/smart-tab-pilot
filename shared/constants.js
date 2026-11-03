/** Shared defaults and constants for Smart Tab Pilot. */

export const DEFAULT_SETTINGS = {
  /** Exact URL match including hash when false (product default). */
  ignoreHash: false,
  /** Close new tab and activate existing duplicate. */
  exactDedupeEnabled: true,
  /** Auto classify + place into tabGroups on navigation complete. */
  autoSemanticGroupEnabled: true,
  /**
   * Quick search UI (P1 / ahead-of-scope). Default off for MVP so search is not
   * implied as a required acceptance path; leave code paths intact.
   */
  quickSearchEnabled: false,
  /** OpenAI-compatible fallback. */
  customBaseUrl: '',
  customApiKey: '',
  customModel: 'gpt-4o-mini',
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
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  EXTRACT_RESULT: 'EXTRACT_RESULT',
  EXTRACT_PAGE: 'EXTRACT_PAGE',
  SEARCH_TABS: 'SEARCH_TABS',
  ACTIVATE_SEARCH_RESULT: 'ACTIVATE_SEARCH_RESULT',
};
