/**
 * Topic classification: Chrome Prompt API (Gemini Nano) → custom OpenAI-compatible → heuristic.
 */
import { CLASSIFY_SYSTEM_PROMPT, MAX_BODY_CHARS } from '../shared/constants.js';
import { getSettings } from '../shared/storage.js';

/** Options shared by availability() and create() so status matches create. */
export const NANO_CREATE_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en', 'zh'] }],
  expectedOutputs: [{ type: 'text', languages: ['en', 'zh'] }],
};

/**
 * @typedef {'available'|'downloadable'|'downloading'|'unavailable'|'missing'} NanoAvailability
 */

/**
 * @returns {Promise<{ availability: NanoAvailability, detail?: string }>}
 */
export async function getNanoStatus() {
  try {
    if (typeof LanguageModel === 'undefined') {
      return { availability: 'missing', detail: 'LanguageModel API not present' };
    }
    const availability = await LanguageModel.availability(NANO_CREATE_OPTIONS);
    // Chromium may return "readily" in older builds; normalize.
    if (availability === 'readily') {
      return { availability: 'available' };
    }
    return { availability: /** @type {NanoAvailability} */ (availability) };
  } catch (err) {
    return {
      availability: 'unavailable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Trigger model download / session create. Must run under user activation (popup click).
 * @returns {Promise<{ ok: boolean, availability?: NanoAvailability, error?: string }>}
 */
export async function downloadNano() {
  try {
    if (typeof LanguageModel === 'undefined') {
      return { ok: false, error: 'LanguageModel API not present' };
    }
    const session = await LanguageModel.create({
      ...NANO_CREATE_OPTIONS,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.info('[SmartTabPilot] Nano download', Math.round((e.loaded || 0) * 100) + '%');
        });
      },
    });
    session.destroy?.();
    const status = await getNanoStatus();
    return { ok: true, availability: status.availability };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * @param {{ title: string, text: string, url?: string }} page
 * @returns {Promise<{ label: string, source: 'nano'|'custom'|'heuristic' }>}
 */
export async function classifyPage(page) {
  const title = (page.title || '').trim();
  const text = (page.text || '').slice(0, MAX_BODY_CHARS).trim();
  const snippet = `${title}\n\n${text}`.trim().slice(0, MAX_BODY_CHARS);

  const nano = await tryNanoClassify(snippet);
  if (nano) return { label: sanitizeLabel(nano), source: 'nano' };

  const custom = await tryCustomClassify(snippet);
  if (custom) return { label: sanitizeLabel(custom), source: 'custom' };

  return { label: sanitizeLabel(heuristicLabel(title, text, page.url)), source: 'heuristic' };
}

/** @param {string} snippet */
async function tryNanoClassify(snippet) {
  try {
    if (typeof LanguageModel === 'undefined') return null;
    const availability = await LanguageModel.availability(NANO_CREATE_OPTIONS);
    if (availability !== 'available' && availability !== 'readily') return null;

    const session = await LanguageModel.create(NANO_CREATE_OPTIONS);
    try {
      const prompt = `${CLASSIFY_SYSTEM_PROMPT}\n\n---\n${snippet}`;
      const raw = await session.prompt(prompt);
      return (raw || '').trim() || null;
    } finally {
      session.destroy?.();
    }
  } catch (err) {
    console.warn('[SmartTabPilot] Nano classify failed', err);
    return null;
  }
}

/** @param {string} snippet */
async function tryCustomClassify(snippet) {
  const settings = await getSettings();
  const base = (settings.customBaseUrl || '').replace(/\/+$/, '');
  const key = settings.customApiKey || '';
  const model = settings.customModel || 'gpt-4o-mini';
  if (!base || !key) return null;

  const url = base.endsWith('/chat/completions')
    ? base
    : `${base}/chat/completions`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 32,
        messages: [
          { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
          { role: 'user', content: snippet },
        ],
      }),
    });
    if (!res.ok) {
      console.warn('[SmartTabPilot] custom model HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : null;
  } catch (err) {
    console.warn('[SmartTabPilot] custom classify failed', err);
    return null;
  }
}

/**
 * Keyword / heuristic fallback from title + snippet only.
 * @param {string} title
 * @param {string} text
 * @param {string} [url]
 */
function heuristicLabel(title, text, url) {
  const blob = `${title} ${text}`.toLowerCase();

  /** @type {[RegExp, string][]} */
  const rules = [
    [/github|gitlab|bitbucket|pull request|commit/, '开发 / Code'],
    [/stackoverflow|stack overflow|文档|documentation|api reference/, '文档 / Docs'],
    [/youtube|bilibili|netflix|视频|video/, '视频 / Video'],
    [/twitter|x\.com|微博|reddit|论坛/, '社交 / Social'],
    [/gmail|outlook|mail\.|邮件/, '邮件 / Mail'],
    [/购物|amazon|淘宝|京东|shop|cart|订单/, '购物 / Shopping'],
    [/新闻|news|bbc|cnn|reuters|澎湃/, '新闻 / News'],
    [/map|地图|google maps|高德|导航/, '地图 / Maps'],
    [/wiki|百科|wikipedia/, '百科 / Wiki'],
    [/chatgpt|claude|gemini|llm|ai\b/, 'AI 工具'],
    [/figma|sketch|design|设计/, '设计 / Design'],
    [/notion|confluence|jira|linear|项目管理/, '协作 / Work'],
  ];

  for (const [re, label] of rules) {
    if (re.test(blob) || (url && re.test(url.toLowerCase()))) return label;
  }

  // First meaningful title tokens
  const cleaned = (title || '')
    .replace(/[\|\-–—·•].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length >= 2 && cleaned.length <= 24) return cleaned;
  if (cleaned.length > 24) return cleaned.slice(0, 20).trim();

  try {
    if (url) return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* ignore */
  }
  return '未分类';
}

/** @param {string} label */
function sanitizeLabel(label) {
  return (label || '未分类')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32) || '未分类';
}
