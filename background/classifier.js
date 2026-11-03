/**
 * Topic classification: Chrome Prompt API (Gemini Nano) → custom OpenAI-compatible → heuristic.
 * Labels are body/title semantics only — never domain/hostname aggregation.
 */
import { CLASSIFY_SYSTEM_PROMPT, MAX_BODY_CHARS } from '../shared/constants.js';
import {
  heuristicLabel,
  rejectDomainishLabel,
  sanitizeLabel,
} from '../shared/label-utils.js';
import { getSettings } from '../shared/storage.js';

export { heuristicLabel, rejectDomainishLabel, sanitizeLabel } from '../shared/label-utils.js';

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
      return rejectDomainishLabel((raw || '').trim()) || null;
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
          {
            role: 'user',
            content:
              'Classify by page topic only (not site/domain).\n\n' + snippet,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn('[SmartTabPilot] custom model HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const raw = typeof content === 'string' ? content.trim() : null;
    return rejectDomainishLabel(raw) || null;
  } catch (err) {
    console.warn('[SmartTabPilot] custom classify failed', err);
    return null;
  }
}


