/** Shared defaults and constants for Smart Tab Pilot. */

export const DEFAULT_SETTINGS = {
  /** Exact URL match including hash when false (product default). */
  ignoreHash: false,
  /** Close new tab and activate existing duplicate. */
  exactDedupeEnabled: true,
  /** Auto classify + place into tabGroups on navigation complete. */
  autoSemanticGroupEnabled: true,
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

export const CLASSIFY_SYSTEM_PROMPT = `You are a tab topic classifier.
Given a page title and body excerpt, reply with ONLY a short topic label (2–8 words).
Use Chinese if the page is mainly Chinese; otherwise English.
No quotes, no punctuation at the end, no explanation.`;

export const MSG = {
  GET_NANO_STATUS: 'GET_NANO_STATUS',
  DOWNLOAD_NANO: 'DOWNLOAD_NANO',
  GROUP_CURRENT_WINDOW: 'GROUP_CURRENT_WINDOW',
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  EXTRACT_RESULT: 'EXTRACT_RESULT',
  SEARCH_TABS: 'SEARCH_TABS',
  ACTIVATE_SEARCH_RESULT: 'ACTIVATE_SEARCH_RESULT',
};
