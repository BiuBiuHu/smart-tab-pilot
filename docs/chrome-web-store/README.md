# Chrome Web Store 上架准备

本目录是**文案与清单**，不是自动登录商店。不要在开发机里打开 Chrome Web Store 开发者后台代为提交。

商店包版本以 `manifest.json` 的 `version` 为准（当前仓库为 **1.5.0**）。

## 打包（可复现）

仓库根目录：

```bash
npm run pack
```

等价于：

```bash
node scripts/pack-extension.mjs
```

打包器顺序：系统 `zip` → `python3` + `zipfile` → **纯 Node**（无 `zip` CLI 也能过 `npm test` / `npm run pack`）。

产物（**不要提交 zip**，本地/CI 生成即可）：

```text
artifacts/smart-tab-pilot-1.5.0.zip
```

zip 根目录就是扩展根（含 `manifest.json`），可直接「加载已解压」对照，或上传该 zip。

### 只打进包的路径

| 包含 | 原因 |
|------|------|
| `manifest.json` | MV3 清单 |
| `background/` | service worker 与分组/去重 |
| `sidepanel/` | 唯一产品 UI |
| `shared/` | 任务图 / i18n / 存储等 |
| `content/` | 页面短摘要抽取 |
| `icons/` | 工具栏与商店图标 |
| `_locales/` | 商店/工具栏 en + zh_CN |
| `LICENSE` | MIT |

### 明确不进包

`tests/`、`docs/`、`.git/`、`node_modules/`、`popup/`（旧对照 UI）、`scripts/`、`README.md`、`package.json`、`artifacts/`。

## 开发者后台要填的材料

| 材料 | 文件 |
|------|------|
| 英文商店文案 | [listing-en.md](./listing-en.md) |
| 中文商店文案 | [listing-zh.md](./listing-zh.md) |
| 权限理由（对照 manifest） | [permissions.md](./permissions.md) |
| 隐私政策草稿（须自行托管公开 URL） | [privacy.md](./privacy.md) / [privacy.html](./privacy.html) |

## 提交前检查（维护者，非终端用户）

1. `npm test` 全绿。
2. `npm run pack`，用 `unzip -l artifacts/smart-tab-pilot-*.zip` 确认无 tests/docs/.git。
3. 准备 **128×128** 图标（仓库 `icons/icon128.png`）以及商店截图（1280×800 或 640×400，至少 1 张）。本仓库不代为截侧栏实机图。
4. 隐私政策公开 URL（填进商店「隐私权政策」）：

   `https://biubiuhu.github.io/smart-tab-pilot/chrome-web-store/privacy.html`

   源文件：`docs/chrome-web-store/privacy.html`（与 [privacy.md](./privacy.md) 同文）。GitHub Pages 从仓库 `docs/` 发布（workflow：`.github/workflows/pages.yml`）。若 Pages 尚未开通：仓库 Settings → Pages → Deploy from a branch → `main` / `/docs`，或把 source 设为 GitHub Actions 后重跑该 workflow。
5. 类别建议：**Productivity**（效率工具）。
6. 单用途说明：整理标签（精确去重 + 任务导航图），不是通用网页改写器。
