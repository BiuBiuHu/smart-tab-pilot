/**
 * zh/en locale resolution, key parity, interpolation, DOM attrs, window badges.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS } from '../shared/constants.js';
import {
  applyDomI18n,
  applyI18nAttributes,
  createTranslator,
  detectBrowserLocale,
  FALLBACK_LOCALE,
  formatWindowBadge,
  interpolate,
  MESSAGES,
  messageKeys,
  normalizeLocale,
  resolveLocale,
  t,
} from '../shared/i18n.js';
import { panelViewState } from '../shared/settings-panel.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'sidepanel/sidepanel.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const enStore = JSON.parse(readFileSync(join(root, '_locales/en/messages.json'), 'utf8'));
const zhStore = JSON.parse(readFileSync(join(root, '_locales/zh_CN/messages.json'), 'utf8'));

describe('resolveLocale / detectBrowserLocale', () => {
  it('defaults uiLocale to auto and falls back to Chinese', () => {
    assert.equal(DEFAULT_SETTINGS.uiLocale, 'auto');
    assert.equal(FALLBACK_LOCALE, 'zh');
    assert.equal(resolveLocale('auto', 'fr-FR'), 'zh');
    assert.equal(resolveLocale(undefined, null), 'zh');
  });

  it('follows browser locale when set to auto', () => {
    assert.equal(resolveLocale('auto', 'zh-CN'), 'zh');
    assert.equal(resolveLocale('auto', 'zh_TW'), 'zh');
    assert.equal(resolveLocale('auto', 'en-US'), 'en');
    assert.equal(resolveLocale('auto', 'en'), 'en');
  });

  it('explicit zh/en override the browser', () => {
    assert.equal(resolveLocale('en', 'zh-CN'), 'en');
    assert.equal(resolveLocale('zh', 'en-GB'), 'zh');
  });

  it('detects chrome.i18n then navigator.language', () => {
    assert.equal(
      detectBrowserLocale({
        chrome: { i18n: { getUILanguage: () => 'en-GB' } },
        navigator: { language: 'zh-CN' },
      }),
      'en',
    );
    assert.equal(detectBrowserLocale({ navigator: { language: 'zh-Hans-CN' } }), 'zh');
    assert.equal(detectBrowserLocale({ navigator: { languages: ['en-AU'] } }), 'en');
    assert.equal(detectBrowserLocale({}), 'zh');
  });

  it('normalizes junk input to zh', () => {
    assert.equal(normalizeLocale(''), 'zh');
    assert.equal(normalizeLocale(12), 'zh');
    assert.equal(normalizeLocale('de-DE'), 'zh');
  });
});

describe('message catalogs', () => {
  it('zh and en share the same keys', () => {
    const zhKeys = Object.keys(MESSAGES.zh).sort();
    const enKeys = Object.keys(MESSAGES.en).sort();
    assert.deepEqual(enKeys, zhKeys);
    assert.ok(zhKeys.length >= 80);
    assert.deepEqual(messageKeys().sort(), zhKeys);
  });

  it('interpolates placeholders and keeps missing vars visible', () => {
    assert.equal(interpolate('已处理 {done}/{total}', { done: 3, total: 9 }), '已处理 3/9');
    assert.equal(t('clusterTitle', { label: 'Docs', n: 4 }, 'en'), 'Docs · 4 tabs');
    assert.equal(t('clusterTitle', { label: '文档', n: 4 }, 'zh'), '文档 · 4 个标签');
    assert.equal(interpolate('x {missing}', {}), 'x {missing}');
  });

  it('unknown keys fall back to the key name', () => {
    assert.equal(createTranslator('en')('notARealKey'), 'notARealKey');
  });

  it('covers the user-facing surfaces', () => {
    for (const key of [
      'settings',
      'backToTasks',
      'closeGroup',
      'scopeAll',
      'scopeCurrent',
      'groupNow',
      'languageAuto',
      'nanoDownloadBtn',
      'taskEmptyAll',
    ]) {
      assert.ok(MESSAGES.zh[key]);
      assert.ok(MESSAGES.en[key]);
      assert.notEqual(MESSAGES.zh[key], MESSAGES.en[key]);
    }
  });
});

describe('applyDomI18n', () => {
  it('writes text / title / aria / placeholder from data-i18n*', () => {
    const store = {
      'data-i18n': 'settings',
      'data-i18n-title': 'settings',
      'data-i18n-aria': 'settingsCurrentAria',
      'data-i18n-placeholder': 'searchPlaceholder',
      textContent: '设置',
    };
    const el = {
      getAttribute: (k) => store[k] ?? null,
      setAttribute: (k, v) => {
        store[k] = v;
      },
      get textContent() {
        return store.textContent;
      },
      set textContent(v) {
        store.textContent = v;
      },
    };
    applyI18nAttributes(el, createTranslator('en'));
    assert.equal(el.textContent, 'Settings');
    assert.equal(store.title, 'Settings');
    assert.equal(store['aria-label'], 'Current view: Settings');
    assert.equal(store.placeholder, 'Search open tabs / recently closed…');
  });

  it('walks a querySelectorAll root once per element', () => {
    const calls = [];
    const el = {
      getAttribute: (name) => (name === 'data-i18n' ? 'refresh' : null),
      textContent: '',
    };
    applyDomI18n(
      {
        querySelectorAll: (sel) => {
          calls.push(sel);
          return sel === '[data-i18n]' ? [el] : [];
        },
      },
      createTranslator('en'),
    );
    assert.ok(calls.length >= 4);
    assert.equal(el.textContent, 'Refresh');
  });
});

describe('formatWindowBadge', () => {
  const en = createTranslator('en');
  const zh = createTranslator('zh');

  it('translates tokens and legacy Chinese badges', () => {
    assert.equal(formatWindowBadge('current', en), 'Current');
    assert.equal(formatWindowBadge('w:2', en), 'Window 2');
    assert.equal(formatWindowBadge('window', en), 'Window');
    assert.equal(formatWindowBadge('当前', zh), '当前');
    assert.equal(formatWindowBadge('窗口 3', zh), '窗口 3');
    assert.equal(formatWindowBadge('当前', en), 'Current');
    assert.equal(formatWindowBadge('窗口 3', en), 'Window 3');
    assert.equal(formatWindowBadge('', en), 'Window');
  });
});

describe('panelViewState uses t() when provided', () => {
  it('renders English chrome when t is English', () => {
    const onSettings = panelViewState('settings', { t: createTranslator('en') });
    assert.equal(onSettings.settingsTrigger['aria-label'], 'Current view: Settings');
    assert.equal(onSettings.back['aria-label'], 'Back to tasks');
    const onTasks = panelViewState('tasks', { t: createTranslator('en') });
    assert.equal(onTasks.settingsTrigger['aria-label'], 'Settings');
  });

  it('keeps Chinese defaults when t is omitted', () => {
    const onSettings = panelViewState('settings');
    assert.equal(onSettings.settingsTrigger['aria-label'], '当前视图：设置');
    assert.equal(onSettings.back.title, '返回任务视图');
  });
});

describe('sidepanel HTML + manifest locales', () => {
  it('wires language radios and data-i18n on static copy', () => {
    assert.match(html, /id="language-section"/);
    assert.match(html, /id="locale-auto"/);
    assert.match(html, /id="locale-zh"/);
    assert.match(html, /id="locale-en"/);
    assert.match(html, /data-i18n="subtitle"/);
    assert.match(html, /data-i18n="backToTasks"/);
    assert.match(html, /data-i18n="closeGroup"|data-i18n="groupNow"/);
    assert.match(html, /data-i18n="scopeAll"/);
    assert.match(html, /data-i18n="togglesTitle"/);
  });

  it('keeps language switch on the settings page, not the task card', () => {
    const settings = html.slice(html.indexOf('id="settings-panel"'), html.indexOf('id="task-view-card"'));
    const task = html.slice(html.indexOf('id="task-view-card"'), html.indexOf('id="search-card"'));
    assert.match(settings, /id="locale-auto"/);
    assert.doesNotMatch(task, /id="locale-auto"/);
    assert.doesNotMatch(settings, /id="scope-all"/);
  });

  it('declares chrome.i18n catalogs for the store listing', () => {
    assert.equal(manifest.default_locale, 'en');
    assert.equal(manifest.name, '__MSG_extName__');
    assert.equal(manifest.description, '__MSG_extDescription__');
    assert.equal(enStore.extName.message, 'Smart Tab Pilot');
    assert.ok(zhStore.extDescription.message.includes('去重'));
    assert.deepEqual(Object.keys(enStore).sort(), Object.keys(zhStore).sort());
    assert.ok(enStore.extDescription.message.length <= 132, enStore.extDescription.message.length);
    assert.ok(zhStore.extDescription.message.length <= 132, zhStore.extDescription.message.length);
  });
});
