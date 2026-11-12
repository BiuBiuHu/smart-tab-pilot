/**
 * Content script: compact text-DOM snapshot for topic classification.
 *
 * Inspired by alibaba/page-agent's text-based (dehydrated) DOM approach —
 * prefer semantic landmarks + visible text over a naive full-body dump,
 * so cheap text models can classify without screenshots / multimodal cost.
 * The snapshot is ephemeral: grouping persists only a short tab summary
 * (title + path/slug + 1–2 sentences), never this full extract.
 * We do NOT vendor page-agent; this is a small in-extension adaptation.
 *
 * @see https://github.com/alibaba/page-agent
 */
(function () {
  const MAX_CHARS = 4000;

  /** Landmark / content roots preferred for main copy (page-agent keepSemanticTags spirit). */
  const CONTENT_SELECTORS = [
    'article',
    'main',
    '[role="main"]',
    '[role="article"]',
    '#content',
    '#main',
    '.content',
    '.post',
    '.article',
    '.entry-content',
    '.markdown-body',
  ];

  /** Noise to strip before collecting text (nav/chrome, not topic signal). */
  const NOISE_SELECTORS = [
    'nav',
    'header',
    'footer',
    'aside',
    'menu',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[role="complementary"]',
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    'iframe',
    'form',
    '.nav',
    '.navbar',
    '.menu',
    '.sidebar',
    '.footer',
    '.header',
    '.cookie',
    '.cookie-banner',
    '#cookie',
    '[aria-hidden="true"]',
  ];

  const HEADING_TAGS = new Set(['H1', 'H2', 'H3']);

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    // Allow off-viewport content (full-page text snapshot), but drop zero-box nodes.
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  function pickContentRoot() {
    for (const sel of CONTENT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return el;
    }
    return document.body;
  }

  /**
   * Clone root, remove noise subtrees, then walk visible text + h1–h3.
   * Output is plain text (dehydrated), not HTML — lower token cost for classifiers.
   */
  function extractReadable(maxChars) {
    const title = (document.title || '').trim();
    const root = pickContentRoot();
    if (!root) {
      return { ok: true, title, text: '', url: location.href };
    }

    const clone = root.cloneNode(true);
    for (const sel of NOISE_SELECTORS) {
      clone.querySelectorAll(sel).forEach((n) => n.remove());
    }

    /** @type {string[]} */
    const parts = [];
    if (title) parts.push(title);

    // Prefer explicit headings from the live document (more reliable than clone visibility).
    const headingEls = root.querySelectorAll('h1, h2, h3');
    for (const h of headingEls) {
      if (!isVisible(h)) continue;
      // Skip headings that live inside noise regions of the live tree.
      if (h.closest(NOISE_SELECTORS.join(','))) continue;
      const t = (h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) parts.push(t);
    }

    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const raw = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (!raw || raw.length < 2) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (HEADING_TAGS.has(parent.tagName)) {
          // Already captured from live headings.
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node = walker.nextNode();
    while (node) {
      const t = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (t) parts.push(t);
      node = walker.nextNode();
    }

    // Deduplicate consecutive identical lines; join with newlines for structure.
    /** @type {string[]} */
    const deduped = [];
    for (const p of parts) {
      if (deduped.length && deduped[deduped.length - 1] === p) continue;
      deduped.push(p);
    }

    let text = deduped.join('\n').trim();
    if (text.length > maxChars) {
      text = text.slice(0, maxChars);
    }

    return {
      ok: true,
      title,
      text,
      url: location.href,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'EXTRACT_PAGE') {
      try {
        sendResponse(extractReadable(MAX_CHARS));
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return true;
    }
    return false;
  });

  // Full location.href (including hash) for exact-dedupe identity.
  // Chrome tabs.Tab.url often omits the fragment.
  const reportLocation = (extra = {}) => {
    try {
      const payload = { url: location.href, ...extra };
      chrome.runtime.sendMessage(
        { type: 'TAB_NAV_HINT', payload },
        () => void chrome.runtime.lastError,
      );
    } catch {
      /* ignore */
    }
  };
  reportLocation(document.referrer ? { referrer: document.referrer } : {});
  window.addEventListener('hashchange', () => reportLocation());
  window.addEventListener('popstate', () => reportLocation());
})();
