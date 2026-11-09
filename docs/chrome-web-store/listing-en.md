# Chrome Web Store listing (English)

Suggested category: **Productivity**

## Short description (≤132 characters)

Exact URL dedupe across windows plus a learnable task graph. Side panel only. Optional on-device Nano or your own model.

Character count: 120

## Detailed description

Smart Tab Pilot keeps your Chrome windows tidy without grouping tabs by website.

**Exact URL dedupe (cross-window)**
If you open a URL that is already open in any window, the existing tab is focused and the duplicate is closed. Matching includes the hash by default; you can ignore the hash in Settings.

**Task navigation graph**
Tabs are clustered by real navigation and model judgment: true opener/referrer edges, then an optional model that reads each tab’s title + URL + short summary. Same window or nearby open time never forces a merge. Page semantics refine names — they do not glue everything from the same hostname together.

**Side panel**
Click the toolbar icon (or Ctrl+Shift+K / ⌘⇧K) to open a full side panel: task cards, drag-to-merge, split, close a whole logical group, all-windows vs this-window, and Settings.

**Language**
Chinese and English. Default follows the browser; you can lock 中文 or English in Settings.

**Optional models**
- Prefer on-device Gemini Nano (Chrome Prompt API) to name tasks and judge same-project tabs.
- If Nano is unavailable, you may set an OpenAI-compatible **Base URL, API key, and model name**. That endpoint is **your URL**. The extension does not ship a vendor backend.
- With no model, only true opener/referrer edges cluster (prefer split over false merges); names fall back to heuristics.

**What it does not do**
- Does not merge tabs just because they share a domain.
- Does not persist full page bodies (only a short title + 1–2 sentence summary).
- Does not include analytics or crash telemetry.

Permissions are limited to tab/group management, side panel UI, short on-page extracts, and optional calls to the model you configure. See the privacy policy for data flow.

## Single purpose

Organize browser tabs: jump to an existing exact-URL tab, and group related work via a task navigation graph in the side panel.
