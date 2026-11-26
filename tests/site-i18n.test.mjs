/**
 * Product GitHub Pages site: complete en / zh pages, no mixed bilingual blocks.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const enHome = readFileSync(join(docs, 'index.html'), 'utf8');
const zhHome = readFileSync(join(docs, 'zh/index.html'), 'utf8');
const enPrivacy = readFileSync(join(docs, 'chrome-web-store/privacy.html'), 'utf8');
const zhPrivacy = readFileSync(join(docs, 'zh/privacy.html'), 'utf8');
const siteJs = readFileSync(join(docs, 'site.js'), 'utf8');

const STORE =
  'https://chromewebstore.google.com/detail/smart-tab-pilot/acnhnhllaloccmnmdjcgmkmpbkpdegfd';
const GITHUB = 'https://github.com/BiuBiuHu/smart-tab-pilot';
const PAGES = 'https://biubiuhu.github.io/smart-tab-pilot';
const CJK = /[\u4e00-\u9fff]/;

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(html, name) {
  const m = html.match(new RegExp(`<html\\b[^>]*\\b${name}="([^"]+)"`, 'i'));
  return m ? m[1] : '';
}

function loadSiteApi() {
  const sandbox = {};
  const ctx = createContext({
    window: sandbox,
    globalThis: sandbox,
    document: undefined
  });
  runInContext(siteJs, ctx);
  return sandbox.stpSiteI18n;
}

describe('Pages language pages exist', () => {
  it('keeps the store privacy URL and adds a Chinese privacy page', () => {
    assert.ok(existsSync(join(docs, 'chrome-web-store/privacy.html')));
    assert.ok(existsSync(join(docs, 'zh/privacy.html')));
    assert.ok(existsSync(join(docs, 'zh/index.html')));
    assert.ok(existsSync(join(docs, 'site.css')));
    assert.ok(existsSync(join(docs, 'site.js')));
  });
});

describe('English home is English-only', () => {
  const text = visibleText(enHome);
  const cjk = [...new Set(text.match(/[\u4e00-\u9fff]+/g) || [])];

  it('declares English metadata and hreflang alternates', () => {
    assert.equal(attr(enHome, 'lang'), 'en');
    assert.match(enHome, /<title>Smart Tab Pilot — Precise dedupe/);
    assert.match(enHome, /name="description" content="Chrome MV3 side-panel extension/);
    assert.match(enHome, new RegExp(`rel="canonical" href="${PAGES}/"`));
    assert.match(enHome, new RegExp(`hreflang="en" href="${PAGES}/"`));
    assert.match(enHome, new RegExp(`hreflang="zh-Hans" href="${PAGES}/zh/"`));
    assert.match(enHome, new RegExp(`hreflang="x-default" href="${PAGES}/"`));
    assert.match(enHome, /og:locale" content="en_US"/);
  });

  it('has an accessible language switch without mixing body copy', () => {
    assert.match(enHome, /aria-label="Language"/);
    assert.match(enHome, /data-set-lang="zh"[^>]*>中文/);
    assert.match(enHome, /aria-current="true"[^>]*>English/);
    assert.deepEqual(cjk, ['中文']);
    assert.doesNotMatch(enHome, /class="lede-zh"|class="section-zh"|class="zh"/);
    assert.doesNotMatch(text, /精确 URL 去重/);
    assert.doesNotMatch(text, /已在 Chrome 网上应用店/);
  });

  it('keeps store, GitHub, and privacy URLs', () => {
    assert.match(enHome, new RegExp(STORE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(enHome, new RegExp(GITHUB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(enHome, /href="chrome-web-store\/privacy.html"/);
    assert.match(enHome, /src="assets\/promo\.mp4"/);
  });
});

describe('Chinese home is Chinese-only', () => {
  const text = visibleText(zhHome);

  it('declares Chinese metadata and hreflang alternates', () => {
    assert.equal(attr(zhHome, 'lang'), 'zh-Hans');
    assert.match(zhHome, /<title>Smart Tab Pilot — 精确去重与任务导航图/);
    assert.match(zhHome, /name="description" content="Chrome MV3 侧边栏扩展/);
    assert.match(zhHome, new RegExp(`rel="canonical" href="${PAGES}/zh/"`));
    assert.match(zhHome, new RegExp(`hreflang="en" href="${PAGES}/"`));
    assert.match(zhHome, new RegExp(`hreflang="zh-Hans" href="${PAGES}/zh/"`));
    assert.match(zhHome, /og:locale" content="zh_CN"/);
  });

  it('has an accessible language switch and no English marketing blocks', () => {
    assert.match(zhHome, /aria-label="语言"/);
    assert.match(zhHome, /data-set-lang="en"[^>]*>English/);
    assert.match(zhHome, /aria-current="true"[^>]*>中文/);
    assert.doesNotMatch(text, /Keep tabs by task/);
    assert.doesNotMatch(text, /What it does/);
    assert.doesNotMatch(text, /Skip to content/);
    assert.doesNotMatch(text, /Install from Chrome Web Store/);
    assert.doesNotMatch(text, /Watch promo/);
    assert.doesNotMatch(text, /Privacy policy/);
    assert.match(text, /按任务整理标签/);
    assert.match(text, /从 Chrome 网上应用店安装/);
    assert.match(text, /隐私政策/);
    assert.ok(CJK.test(text));
  });

  it('uses relative asset paths that resolve from /zh/', () => {
    assert.match(zhHome, /href="\.\.\/site\.css"/);
    assert.match(zhHome, /src="\.\.\/site\.js"/);
    assert.match(zhHome, /src="\.\.\/assets\/promo\.mp4"/);
    assert.match(zhHome, /href="privacy\.html"/);
    assert.match(zhHome, new RegExp(STORE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});

describe('Privacy pages stay on the store URL and are not mixed', () => {
  it('English privacy keeps the hosted store path and drops the Chinese summary', () => {
    assert.equal(attr(enPrivacy, 'lang'), 'en');
    assert.match(enPrivacy, /<title>Smart Tab Pilot — Privacy Policy/);
    assert.match(
      enPrivacy,
      new RegExp(`rel="canonical" href="${PAGES}/chrome-web-store/privacy.html"`)
    );
    assert.match(enPrivacy, /aria-label="Language"/);
    assert.match(enPrivacy, /href="\.\.\/zh\/privacy\.html"/);
    assert.doesNotMatch(visibleText(enPrivacy), /中文摘要/);
    assert.doesNotMatch(enPrivacy, /class="zh"/);
    const cjk = visibleText(enPrivacy).match(/[\u4e00-\u9fff]+/g) || [];
    assert.deepEqual([...new Set(cjk)], ['中文']);
  });

  it('Chinese privacy is a complete policy, not a summary stub', () => {
    assert.equal(attr(zhPrivacy, 'lang'), 'zh-Hans');
    assert.match(zhPrivacy, /<title>Smart Tab Pilot — 隐私政策/);
    assert.match(zhPrivacy, /没有自有云账号/);
    assert.match(zhPrivacy, /不会上传页面正文/);
    assert.match(zhPrivacy, /GitHub 仓库 Issues/);
    assert.doesNotMatch(visibleText(zhPrivacy), /Who we are/);
    assert.doesNotMatch(visibleText(zhPrivacy), /Last updated:/);
    assert.match(zhPrivacy, /href="\.\.\/chrome-web-store\/privacy\.html"/);
  });
});

describe('site.js language helpers', () => {
  const api = loadSiteApi();

  it('prefers an explicit stored language over the browser', () => {
    assert.equal(api.preferSiteLang('en', ['zh-CN']), 'en');
    assert.equal(api.preferSiteLang('zh', ['en-US']), 'zh');
  });

  it('falls back to browser Chinese, else English', () => {
    assert.equal(api.preferSiteLang(null, ['zh-CN', 'en']), 'zh');
    assert.equal(api.preferSiteLang(undefined, ['en-US']), 'en');
    assert.equal(api.preferSiteLang(null, ['fr-FR']), 'en');
  });

  it('builds /zh/ targets from GitHub Pages and local preview paths', () => {
    assert.equal(
      api.zhHomeTarget('/smart-tab-pilot/', '', '#promo'),
      '/smart-tab-pilot/zh/#promo'
    );
    assert.equal(
      api.zhHomeTarget('/smart-tab-pilot/index.html', '?x=1', '#install'),
      '/smart-tab-pilot/zh/?x=1#install'
    );
    assert.equal(api.zhHomeTarget('/zh/', '', ''), null);
    assert.equal(api.zhHomeTarget('/smart-tab-pilot/zh/', '', '#x'), null);
    assert.equal(api.zhHomeTarget('/', '', '#features'), '/zh/#features');
  });

  it('preserves hashes on language-switch hrefs', () => {
    assert.equal(api.withHash('https://example.test/zh/', '#promo'), 'https://example.test/zh/#promo');
    assert.equal(api.withHash('/zh/#old', '#features'), '/zh/#features');
  });
});
