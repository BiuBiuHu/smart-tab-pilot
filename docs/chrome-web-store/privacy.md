# Privacy policy (draft)

Publish this text (or a hosted equivalent) at a **public HTTPS URL** and paste that URL into the Chrome Web Store listing. The store requires a privacy policy because the extension can read tab URLs/titles and optional page excerpts, and may call a user-configured model endpoint.

Last updated: 2026-11-03  
Product: Smart Tab Pilot (Chrome Manifest V3 extension)

## Who we are

Smart Tab Pilot is an open-source browser extension (MIT). There is **no first-party cloud account** and **no operator backend** shipped with the extension.

## What the extension stores on your device

Using Chrome storage APIs only:

- Settings you choose (dedupe, hash matching, auto-group, quick search, window scope, UI language).
- Optional custom model fields: Base URL, API key, model name (`chrome.storage.sync`).
- Short tab summaries: title, path/slug, 1–2 sentences — **never the full page body**.
- Navigation-graph priors (URL patterns, not full page text).
- In-session merge/split edges and a recently closed list for optional search.

Uninstalling the extension removes this data from the profile (subject to Chrome’s own storage rules).

## What is read from pages

A content script may read a compact text snapshot from `http(s)` pages so tasks can be named by **topic**, not by website brand. The in-memory extract is capped and then reduced to a short summary before anything is saved.

Restricted pages (`chrome://`, `chrome-extension://`, `about:`, etc.) are skipped.

## Network: what leaves the device

**Default / no custom model**

- If Chrome Prompt API (`LanguageModel` / Gemini Nano) is available, short snippets are sent to the **on-device** model. That path does not use a developer-operated server.
- If Nano is missing and you have not configured a custom model, grouping uses local heuristics only. **No page text is uploaded.**

**Custom model (only if you configure it)**

- You may enter an OpenAI-compatible Base URL, API key, and model name.
- The extension then POSTs short classify / same-group prompts to **that URL** (typically `{base}/chat/completions`) with your key.
- The destination is entirely **user-provided**. The authors do not receive a copy.
- Do not point this at an untrusted host; treat the key as a secret.

**Not sent**

- No analytics, advertising IDs, crash telemetry, or usage beacons appear in the source.
- No automatic call to a hardcoded Smart Tab Pilot API.

## Third parties

- Google Chrome (tab/group/side-panel APIs; optional on-device Nano).
- Only if you opt in: the operator of the URL you type as Base URL.

## Children

The extension is a productivity tool for browser tabs. It is not directed at children and does not knowingly collect children’s personal information.

## Changes

If data practices change (for example a future first-party endpoint), this policy and the store listing must be updated before that version is published.

## Contact

Use the GitHub repository issues for the project that hosts this extension.
