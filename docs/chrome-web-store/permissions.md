# Permission justifications

These match `manifest.json` for store item “Privacy practices” / permission disclosure. Paste a short version into the developer dashboard; keep this file as the long form.

## `tabs`

Read tab URL, title, window, and id so the extension can:

- find an already-open exact URL in **any** window and activate it;
- build the task navigation graph (opener / window / time);
- render the side-panel task list and search;
- close a logical group’s tabs.

Without `tabs`, cross-window dedupe and the task view cannot work.

## `tabGroups`

Create, update, and reuse `chrome.tabGroups` **inside each window** after a logical cluster is computed. Chrome tab groups are per-window; the extension never claims a cross-window physical group.

## `sidePanel`

The product UI is a Chrome side panel (`sidepanel/sidepanel.html`), not an action popup. This permission opens and fills that panel when the user clicks the toolbar icon or uses the command.

## `storage`

Persist user settings (`chrome.storage.sync`: dedupe/hash/auto-group/search/window scope, `uiLocale`, optional custom model URL/key/name) and local/session working data (short tab summaries, navigation priors, recently closed list, in-session merge/split edges). No account sync to a first-party server.

## `sessions`

Read Chrome’s recently closed tabs so optional quick search can reopen them. Entries closed by exact-URL dedupe are not added as “recently closed” by this extension.

## `webNavigation`

Read the committed main-frame URL **including the fragment (`#...`)** and hash-only updates. Chrome’s `tabs.Tab.url` often omits the hash, which would make `/page#a` and `/page#b` look identical to exact-URL dedupe. This permission is used only to record the full URL for identity matching; it does not inject into pages or rewrite navigation.

## `scripting`

Fallback inject when the content script cannot extract a compact text snapshot (CSP / some sandboxed pages). Used only to obtain a short excerpt for naming/judging, never to rewrite the page.

## Host permission `<all_urls>` (and content script `http(s)://*/*`)

The content script runs on ordinary web pages to take a **short text snapshot** (title + main text, capped, then distilled to ~280 characters). That is required because:

- topic labels come from page content, not the hostname;
- the optional model (Nano or user endpoint) only sees that short snippet / summary.

The extension does not inject UI into pages and does not change page DOM beyond reading text.

## Optional remote code / user endpoint

Not a host permission in the manifest. If the user saves a custom Base URL, the service worker `fetch`es `{base}/chat/completions` (or the URL as given if it already ends with that path) with the user-supplied API key. The destination is **user-configured**, not a hardcoded vendor.

## Commands

`commands._execute_action` (Ctrl+Shift+K / ⌘⇧K) opens the side panel. Remappable in `chrome://extensions/shortcuts`.
