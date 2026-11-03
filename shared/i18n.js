/**
 * Side-panel i18n: zh / en message map + t().
 * Runtime language follows settings.uiLocale (auto | zh | en).
 * auto → chrome.i18n / navigator, then Chinese.
 */

export const FALLBACK_LOCALE = 'zh';
export const SUPPORTED_LOCALES = ['zh', 'en'];
export const UI_LOCALE_AUTO = 'auto';

export const MESSAGES = {
  zh: {
    subtitle: '精确去重 · 任务导航图（来源优先，语义精炼）',
    settings: '设置',
    settingsCurrentTitle: '当前：设置',
    settingsCurrentAria: '当前视图：设置',
    panelHint: '侧边栏面板 · 点击工具栏图标即可打开',
    backToTasks: '返回任务视图',
    settingsPageTitle: '设置',

    languageTitle: '界面语言',
    languageAuto: '跟随浏览器',
    languageZh: '中文',
    languageEn: 'English',

    nanoTitle: 'Gemini Nano（内置 Prompt API）',
    nanoStatusLabel: '状态',
    nanoChecking: '检测中…',
    nanoAvailable: '可用',
    nanoDownloadable: '可下载',
    nanoDownloading: '下载中…',
    nanoUnavailable: '不可用',
    nanoMissing: 'API 缺失',
    nanoDetectFailed: '检测失败',
    nanoHintAvailable: '将优先使用设备端 Gemini Nano 给任务簇打主题名（同网站不同主题仍会分任务）。',
    nanoHintDownloadable: '模型尚未下载。请点击下方按钮（需用户手势）触发下载。',
    nanoHintDownloading: '模型正在下载，请稍候再试。',
    nanoHintUnavailable:
      '当前环境无法使用 Nano。可配置下方自定义模型，或使用启发式主题名（任务簇仍以来源/时间为准）。',
    nanoHintMissing: '浏览器未暴露 LanguageModel。请使用支持 Prompt API 的 Chrome（实验旗标 / 足够新的版本）。',
    nanoDownloadBtn: '下载 / 启用 Nano 模型',
    nanoDownloadingBtn: '正在请求下载…',
    nanoDownloadOk: '已触发 Nano 下载 / 会话创建。',
    nanoDownloadFail: '下载失败：{error}',

    customTitle: '自定义模型（OpenAI 兼容）',
    customHint:
      '当 Nano 不可用时使用。填写 Base URL、API Key、模型名。分类按页面主题，不会按网站域名合并标签组。',
    customBaseUrl: 'Base URL',
    customApiKey: 'API Key',
    customModel: '模型名',
    customSave: '保存自定义模型',
    customSaved: '自定义模型已保存。',
    fallbackCustom: '当前将使用自定义模型为任务簇命名（分组本身按任务导航图，非域名）。',
    fallbackHeuristic:
      '无可用模型时，任务簇以来源/时间/学习边聚合，主题名用启发式（不会用域名作为组名）。',

    togglesTitle: '功能开关',
    toggleDedupe: '精确 URL 去重跳转',
    toggleIgnoreHash: '去重时忽略 hash（默认关闭＝含 hash 精确匹配）',
    toggleAutoGroup: '自动按任务归组（来源/时间优先，语义只作精炼）',
    toggleQuickSearch: '启用快速搜索（P1，默认关闭）',

    taskViewTitle: '任务视图',
    scopeAria: '窗口范围',
    scopeAll: '全部窗口',
    scopeCurrent: '仅当前窗口',
    refresh: '刷新',
    groupNow: '立即整理任务',
    taskLoading: '正在加载任务…',
    taskEmptyAll: '当前没有可展示的 http(s) 标签。打开几个页面后再刷新。',
    taskEmptyCurrent: '当前窗口没有可展示的标签。可切换到「全部窗口」。',
    progressZero: '已处理 0/0',
    clusterTitle: '{label} · {n} 个标签',
    clusterCrossWindow: ' · 跨窗口（逻辑）',
    uncategorized: '未分类',
    closeGroup: '关闭本组',
    mergePrev: '与上一任务合并',
    dragHint: '拖到另一任务上合并',
    splitTask: '拆成独立任务',
    windowCurrent: '当前',
    windowN: '窗口 {n}',
    windowFallback: '窗口',

    edgeGraph: '任务导航图',
    edgeSolo: '独立任务',
    edgeOpener: '来源×{n}',
    edgeReferrer: '引用×{n}',
    edgeProject: '项目×{n}',
    edgeTime: '时间×{n}',
    edgeLearned: '学习×{n}',
    edgeFeedback: '反馈×{n}',
    edgeModel: '模型×{n}',

    closingTabs: '正在关闭 {n} 个标签…',
    closeNone: '本组没有可关闭的标签',
    closedTabs: '已关闭本组 {n} 个标签',
    closeAlreadyGone: '本组标签已不在',
    closeNothing: '没有关闭任何标签',

    merging: '正在合并任务…',
    splitting: '正在拆分任务…',
    mergedOk: '已合并：会加强这两类导航的学习权重。',
    splitOk: '已拆分：本次会话不再把这些标签并成同一任务。',

    groupingAll: '正在快速成组（全部窗口）…',
    groupingCurrent: '正在快速成组（当前窗口）…',
    quickRefine: '已快速成组，正在精炼标题 0/{total}',
    quickRefineAll: '已快速成组，正在精炼全部未缓存页（0/{total}）…',
    quickDone: '已快速成组。',
    quickNoRefine: '已快速成组，无需精炼',
    processed: '已处理 {done}/{total}',
    processedEllipsis: '已处理 {done}/{total}…',
    refineStalled: '精炼进度中断，请重试。按钮已恢复。',
    groupFail: '整理失败：{error}',
    groupSummary: '已整理 {grouped} 个标签 / {tasks} 个任务',
    groupRefined: '；精炼 {refined}/{refined}',
    groupLabels: '（{labels}）',
    groupSources: '；主题来源：{src}',
    sourceNano: 'Nano',
    sourceCustom: '自定义',
    sourceHeuristic: '启发式',
    unknownError: '未知错误',
    rpcTimeout: '后台响应超时，请重试',

    searchTitle: '快速搜索',
    searchOptional: '（可选 / 默认关闭）',
    searchPlaceholder: '搜索打开的标签 / 最近关闭…',
    searchAria: '快速搜索',
    searchShortcutTitle: '也可在 chrome://extensions/shortcuts 修改',
    searchResultsAria: '搜索结果',
    searchNoMatch: '无匹配结果',
    searchNoTabs: '暂无标签可显示',
    searchOpenSection: '打开的标签',
    searchClosedSection: '最近关闭',
    searchTagOpen: '打开',
    searchTagClosed: '关闭',
  },
  en: {
    subtitle: 'Exact dedupe · task navigation graph (source first, semantics refine)',
    settings: 'Settings',
    settingsCurrentTitle: 'Now: Settings',
    settingsCurrentAria: 'Current view: Settings',
    panelHint: 'Side panel · click the toolbar icon to open',
    backToTasks: 'Back to tasks',
    settingsPageTitle: 'Settings',

    languageTitle: 'Language',
    languageAuto: 'Match browser',
    languageZh: '中文',
    languageEn: 'English',

    nanoTitle: 'Gemini Nano (built-in Prompt API)',
    nanoStatusLabel: 'Status',
    nanoChecking: 'Checking…',
    nanoAvailable: 'Available',
    nanoDownloadable: 'Downloadable',
    nanoDownloading: 'Downloading…',
    nanoUnavailable: 'Unavailable',
    nanoMissing: 'API missing',
    nanoDetectFailed: 'Check failed',
    nanoHintAvailable:
      'On-device Gemini Nano will name task clusters (same site, different topics stay split).',
    nanoHintDownloadable: 'The model is not downloaded yet. Click the button below (user gesture required).',
    nanoHintDownloading: 'The model is downloading. Please wait and try again.',
    nanoHintUnavailable:
      'Nano is not available here. Configure a custom model below, or use heuristic names (clusters still follow source/time).',
    nanoHintMissing:
      'This browser does not expose LanguageModel. Use a Chrome build with the Prompt API (experiment flags / a recent version).',
    nanoDownloadBtn: 'Download / enable Nano',
    nanoDownloadingBtn: 'Requesting download…',
    nanoDownloadOk: 'Nano download / session create started.',
    nanoDownloadFail: 'Download failed: {error}',

    customTitle: 'Custom model (OpenAI-compatible)',
    customHint:
      'Used when Nano is unavailable. Fill in Base URL, API key, and model name. Labels follow page topics — tabs are not merged by hostname.',
    customBaseUrl: 'Base URL',
    customApiKey: 'API Key',
    customModel: 'Model name',
    customSave: 'Save custom model',
    customSaved: 'Custom model saved.',
    fallbackCustom:
      'Task clusters will be named by the custom model (grouping follows the task graph, not domains).',
    fallbackHeuristic:
      'With no model, clusters follow source/time/learned edges; names use heuristics (never the hostname).',

    togglesTitle: 'Feature toggles',
    toggleDedupe: 'Exact-URL dedupe jump',
    toggleIgnoreHash: 'Ignore hash when deduping (off = match including hash)',
    toggleAutoGroup: 'Auto-group by task (source/time first; semantics only refine)',
    toggleQuickSearch: 'Enable quick search (P1, off by default)',

    taskViewTitle: 'Task view',
    scopeAria: 'Window scope',
    scopeAll: 'All windows',
    scopeCurrent: 'This window only',
    refresh: 'Refresh',
    groupNow: 'Group now',
    taskLoading: 'Loading tasks…',
    taskEmptyAll: 'No http(s) tabs to show. Open a few pages and refresh.',
    taskEmptyCurrent: 'No tabs in this window. Switch to “All windows”.',
    progressZero: 'Processed 0/0',
    clusterTitle: '{label} · {n} tabs',
    clusterCrossWindow: ' · cross-window (logical)',
    uncategorized: 'Uncategorized',
    closeGroup: 'Close group',
    mergePrev: 'Merge with previous',
    dragHint: 'Drag onto another task to merge',
    splitTask: 'Split into separate tasks',
    windowCurrent: 'Current',
    windowN: 'Window {n}',
    windowFallback: 'Window',

    edgeGraph: 'Task navigation graph',
    edgeSolo: 'Standalone task',
    edgeOpener: 'source×{n}',
    edgeReferrer: 'referrer×{n}',
    edgeProject: 'project×{n}',
    edgeTime: 'time×{n}',
    edgeLearned: 'learned×{n}',
    edgeFeedback: 'feedback×{n}',
    edgeModel: 'model×{n}',

    closingTabs: 'Closing {n} tabs…',
    closeNone: 'No closable tabs in this group',
    closedTabs: 'Closed {n} tabs in this group',
    closeAlreadyGone: 'Those tabs are already gone',
    closeNothing: 'No tabs were closed',

    merging: 'Merging tasks…',
    splitting: 'Splitting tasks…',
    mergedOk: 'Merged: learning weights for this navigation pair are stronger.',
    splitOk: 'Split: these tabs stay separate for this session.',

    groupingAll: 'Quick-grouping (all windows)…',
    groupingCurrent: 'Quick-grouping (this window)…',
    quickRefine: 'Quick groups ready, refining titles 0/{total}',
    quickRefineAll: 'Quick groups ready, refining uncached pages (0/{total})…',
    quickDone: 'Quick groups ready.',
    quickNoRefine: 'Quick groups ready, nothing to refine',
    processed: 'Processed {done}/{total}',
    processedEllipsis: 'Processed {done}/{total}…',
    refineStalled: 'Refine stalled. Please retry. The button is enabled again.',
    groupFail: 'Grouping failed: {error}',
    groupSummary: 'Grouped {grouped} tabs / {tasks} tasks',
    groupRefined: '; refined {refined}/{refined}',
    groupLabels: ' ({labels})',
    groupSources: '; label source: {src}',
    sourceNano: 'Nano',
    sourceCustom: 'custom',
    sourceHeuristic: 'heuristic',
    unknownError: 'unknown error',
    rpcTimeout: 'Background timed out, please retry',

    searchTitle: 'Quick search',
    searchOptional: '(optional / off by default)',
    searchPlaceholder: 'Search open tabs / recently closed…',
    searchAria: 'Quick search',
    searchShortcutTitle: 'Remap in chrome://extensions/shortcuts',
    searchResultsAria: 'Search results',
    searchNoMatch: 'No matches',
    searchNoTabs: 'No tabs to show',
    searchOpenSection: 'Open tabs',
    searchClosedSection: 'Recently closed',
    searchTagOpen: 'Open',
    searchTagClosed: 'Closed',
  },
};

/**
 * @param {unknown} raw
 * @returns {'zh'|'en'}
 */
export function normalizeLocale(raw) {
  if (!raw || typeof raw !== 'string') return FALLBACK_LOCALE;
  const lower = raw.trim().toLowerCase().replace(/_/g, '-');
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return FALLBACK_LOCALE;
}

/**
 * @param {{ chrome?: { i18n?: { getUILanguage?: () => string } }, navigator?: { language?: string, languages?: string[] } }} [env]
 * @returns {'zh'|'en'}
 */
export function detectBrowserLocale(env = globalThis) {
  const chromeLang = env?.chrome?.i18n?.getUILanguage?.();
  const nav = env?.navigator?.language || env?.navigator?.languages?.[0];
  return normalizeLocale(chromeLang || nav);
}

/**
 * @param {unknown} uiLocale  auto | zh | en
 * @param {unknown} [detected]
 * @returns {'zh'|'en'}
 */
export function resolveLocale(uiLocale, detected) {
  if (uiLocale === 'zh' || uiLocale === 'en') return uiLocale;
  return normalizeLocale(detected) || FALLBACK_LOCALE;
}

/**
 * @param {string} template
 * @param {Record<string, unknown>} [vars]
 */
export function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] == null ? `{${key}}` : String(vars[key]),
  );
}

/**
 * @param {'zh'|'en'|string} locale
 * @returns {(key: string, vars?: Record<string, unknown>) => string}
 */
export function createTranslator(locale) {
  const resolved = normalizeLocale(locale);
  const table = MESSAGES[resolved] || MESSAGES[FALLBACK_LOCALE];
  const fallback = MESSAGES[FALLBACK_LOCALE];
  return function t(key, vars) {
    const raw = table[key] ?? fallback[key] ?? key;
    return interpolate(raw, vars);
  };
}

/**
 * @param {string} key
 * @param {Record<string, unknown>} [vars]
 * @param {'zh'|'en'|string} [locale]
 */
export function t(key, vars, locale = FALLBACK_LOCALE) {
  return createTranslator(locale)(key, vars);
}

/** @returns {string[]} */
export function messageKeys() {
  return Object.keys(MESSAGES[FALLBACK_LOCALE]);
}

/**
 * @param {unknown} token  current | w:N | window | legacy 当前 / 窗口 N
 * @param {(key: string, vars?: Record<string, unknown>) => string} translate
 */
export function formatWindowBadge(token, translate) {
  if (!token) return translate('windowFallback');
  const raw = String(token);
  if (raw === 'current' || raw === '当前') return translate('windowCurrent');
  if (raw === 'window' || raw === '窗口') return translate('windowFallback');
  const m = /^(?:w:|窗口\s*)(\d+)$/.exec(raw);
  if (m) return translate('windowN', { n: m[1] });
  return raw;
}

/**
 * Apply data-i18n / data-i18n-title / data-i18n-aria / data-i18n-placeholder.
 * @param {{ getAttribute: (name: string) => string | null, setAttribute?: (name: string, value: string) => void, textContent?: string }} el
 * @param {(key: string, vars?: Record<string, unknown>) => string} translate
 */
export function applyI18nAttributes(el, translate) {
  if (!el?.getAttribute) return;
  const textKey = el.getAttribute('data-i18n');
  if (textKey) el.textContent = translate(textKey);
  const titleKey = el.getAttribute('data-i18n-title');
  if (titleKey && el.setAttribute) el.setAttribute('title', translate(titleKey));
  const ariaKey = el.getAttribute('data-i18n-aria');
  if (ariaKey && el.setAttribute) el.setAttribute('aria-label', translate(ariaKey));
  const phKey = el.getAttribute('data-i18n-placeholder');
  if (phKey && el.setAttribute) el.setAttribute('placeholder', translate(phKey));
}

/**
 * @param {{ querySelectorAll?: (sel: string) => Iterable<unknown> }} root
 * @param {(key: string, vars?: Record<string, unknown>) => string} translate
 */
export function applyDomI18n(root, translate) {
  if (!root?.querySelectorAll) return;
  const seen = new Set();
  for (const sel of ['[data-i18n]', '[data-i18n-title]', '[data-i18n-aria]', '[data-i18n-placeholder]']) {
    for (const el of root.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      applyI18nAttributes(el, translate);
    }
  }
}

/** @param {boolean} settingsView */
export function settingsTriggerCopy(settingsView, translate) {
  return {
    title: settingsView ? translate('settingsCurrentTitle') : translate('settings'),
    'aria-label': settingsView ? translate('settingsCurrentAria') : translate('settings'),
  };
}
