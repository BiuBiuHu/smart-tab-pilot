/**
 * Product-site language preference (not the extension UI).
 * URL is the source of truth; localStorage remembers an explicit switch.
 * English home may send first-time Chinese browsers to /zh/, preserving hash.
 */
(function (global) {
  var KEY = 'stp-site-lang';

  function preferSiteLang(stored, languages) {
    if (stored === 'zh' || stored === 'en') return stored;
    var list = languages || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i] || '').toLowerCase().indexOf('zh') === 0) return 'zh';
    }
    return 'en';
  }

  function zhHomeTarget(pathname, search, hash) {
    var path = String(pathname || '/').replace(/\/index\.html$/i, '/');
    if (path.charAt(path.length - 1) !== '/') path += '/';
    if (/(?:^|\/)zh\/$/.test(path) || /(?:^|\/)zh\/./.test(path)) return null;
    return path + 'zh/' + (search || '') + (hash || '');
  }

  function withHash(href, hash) {
    if (!hash) return href;
    return String(href).split('#')[0] + hash;
  }

  function readStored() {
    try {
      return global.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function writeStored(lang) {
    try {
      global.localStorage.setItem(KEY, lang);
    } catch (e) { /* private mode */ }
  }

  global.stpSiteI18n = {
    KEY: KEY,
    preferSiteLang: preferSiteLang,
    zhHomeTarget: zhHomeTarget,
    withHash: withHash
  };

  var doc = global.document;
  if (!doc || !doc.documentElement) return;

  var mode = doc.documentElement.getAttribute('data-lang-mode');
  if (mode === 'en-home') {
    var langs =
      (global.navigator && (global.navigator.languages || [global.navigator.language])) || [];
    if (preferSiteLang(readStored(), langs) === 'zh') {
      var loc = global.location;
      var target = zhHomeTarget(loc.pathname, loc.search, loc.hash);
      if (target) {
        loc.replace(target);
        return;
      }
    }
  }

  function bindLangSwitch() {
    var links = doc.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function (e) {
        var lang = this.getAttribute('data-set-lang');
        if (lang === 'zh' || lang === 'en') writeStored(lang);
        var hash = global.location && global.location.hash;
        if (hash) {
          e.preventDefault();
          global.location.href = withHash(this.href, hash);
        }
      });
    }
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', bindLangSwitch);
  } else {
    bindLangSwitch();
  }
})(typeof window !== 'undefined' ? window : globalThis);
