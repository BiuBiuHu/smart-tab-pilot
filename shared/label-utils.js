/**
 * Pure label helpers — topic labels must never collapse to domain/hostname.
 */

/**
 * Drop labels that are clearly just a site/domain/brand.
 * @param {string | null | undefined} label
 * @returns {string}
 */
export function rejectDomainishLabel(label) {
  if (!label) return '';
  let s = String(label).trim();
  if (!s) return '';

  s = s.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

  const lower = s.toLowerCase();
  const domainLike =
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s) ||
    /\.(com|org|net|io|dev|cn|app|ai|co|edu|gov)(\b|$)/i.test(lower);

  const brandOnly = new Set([
    'github',
    'gitlab',
    'bitbucket',
    'wikipedia',
    'wiki',
    'youtube',
    'bilibili',
    'google',
    'medium',
    'stackoverflow',
    'stack overflow',
    'reddit',
    'twitter',
    'facebook',
    'linkedin',
    'notion',
    'confluence',
    'jira',
    'figma',
    'amazon',
    '淘宝',
    '京东',
    '知乎',
    '微博',
    '百度',
    '谷歌',
    'github.com',
    'www',
  ]);

  if (domainLike || brandOnly.has(lower)) return '';
  return s;
}

/** @param {string} label */
export function sanitizeLabel(label) {
  const cleaned = rejectDomainishLabel(
    (label || '未分类')
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  return (cleaned || '未分类').slice(0, 32) || '未分类';
}

/**
 * Keyword / heuristic fallback from title + body snippet.
 * Never returns hostname/domain as the group label.
 * @param {string} title
 * @param {string} text
 * @param {string} [url]
 */
export function heuristicLabel(title, text, url) {
  const blob = `${title} ${text}`.toLowerCase();

  /** @type {[RegExp, string][]} */
  const rules = [
    [/pull request|merge request|code review|git blame|commit history|ci\/cd|单元测试|unit test/, '开发协作'],
    [/api reference|rest api|openapi|graphql schema|sdk 文档|developer docs/, 'API 文档'],
    [/tutorial|how to|getting started|入门|教程|指南/, '教程指南'],
    [/stackoverflow|stack overflow|报错|exception|stack trace|debug/, '排错问答'],
    [/youtube|bilibili|netflix|视频|video essay|纪录片/, '视频内容'],
    [/twitter|x\.com|微博|reddit|论坛|讨论区/, '社交讨论'],
    [/gmail|outlook|inbox|邮件|newsletter/, '邮件'],
    [/购物车|加入购物车|add to cart|订单|checkout|淘宝|京东|amazon\.com\/(?:dp|gp)/, '购物'],
    [/突发|breaking|reuters|澎湃|新闻稿|news article/, '新闻'],
    [/路线|导航|directions|通勤|transit/, '地图出行'],
    [/wiki|百科|wikipedia/, '百科条目'],
    [/prompt engineering|llm|large language|chatgpt|claude|gemini nano/, 'AI 话题'],
    [/figma|ui kit|设计规范|design system|typography/, '设计'],
    [/jira|linear\.app|sprint|看板|roadmap|项目管理/, '项目管理'],
  ];

  for (const [re, label] of rules) {
    if (re.test(blob)) return label;
    if (url) {
      try {
        const u = new URL(url);
        const pathBlob = `${u.pathname} ${u.search}`.toLowerCase();
        if (re.test(pathBlob)) return label;
      } catch {
        /* ignore */
      }
    }
  }

  const cleaned = (title || '')
    .replace(/[\|\-–—·•].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const fromTitle = rejectDomainishLabel(cleaned);
  if (fromTitle && fromTitle.length >= 2 && fromTitle.length <= 24) return fromTitle;
  if (fromTitle && fromTitle.length > 24) return fromTitle.slice(0, 20).trim();

  const firstLine = (text || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length >= 4);
  const fromBody = rejectDomainishLabel(firstLine || '');
  if (fromBody && fromBody.length >= 4) {
    return fromBody.length <= 24 ? fromBody : fromBody.slice(0, 20).trim();
  }

  return '未分类';
}
