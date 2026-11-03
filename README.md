# Smart Tab Pilot

Manifest V3 Chrome 扩展：**精确 URL 去重跳转（跨窗口）** + **任务导航图归组**（来源 / 时间优先，语义只作精炼与命名；同域不同主题分不同任务，不按域名聚合）。UI 使用 Chrome **侧边栏（side panel）**占满浏览器侧栏；快速搜索为可选能力（侧边栏内默认关闭）。

纯前端 JS，无需构建步骤；可直接「加载已解压的扩展程序」。开源协议：[MIT](./LICENSE)。

## 功能

1. **精确 URL 去重**  
   任一窗口若已有标签页打开了相同 URL，则**聚焦该窗口并激活已有标签**，关闭新标签。  
   - 默认 **精确匹配（含 hash）**：设置项 `ignoreHash` 默认为 `false`。  
   - 可在侧边栏中开启「去重时忽略 hash」。  
   - 跳过 `chrome://`、`chrome-extension://`、`about:`、`edge://` 等内部页。

2. **任务导航图（navigation graph learning）**  
   - 强边：`openerTabId` 标签树；`document.referrer` 命中另一个打开中的页面。  
   - 中边：同一窗口、短时间相邻打开（默认 45s）。  
   - 弱边：标签关闭后记住 origin+path 模式对，同类导航会加强关联。  
   - 产品 slug（如 `bettr-promotion`）只当**候选特征**，不 regex 硬并；**最终同项目合并由模型根据短摘要判断**。  
   - 语义只用于精炼与命名。跨窗口**不是**拆组原因。  
   - 每标签只持久化**短摘要**（标题 + path/slug + 1–2 句），不存整页正文。  
   - **禁止按裸域名聚合**；同域不同产品仍可拆。同窗物理组按标题合一，不得出现两个「LinkE」。  
   - `chrome.tabGroups` 仍按窗口物理写入；跨窗口只做逻辑聚合。  
   - 侧栏可把任意任务卡（或标签）**拖到另一任务上合并**，或「拆成独立任务」；会加强该对 URL 的学习权重。

3. **模型策略**  
   - 优先 Chrome 内置 Prompt API `LanguageModel`（Gemini Nano）。  
   - 用与 `create`/`prompt` 相同的 options 调用 `LanguageModel.availability()`。  
   - `downloadable` / `downloading`：侧边栏显示状态，并提供需用户手势触发的「下载 Nano」按钮（`LanguageModel.create()`）。  
   - `unavailable` 或 API 缺失：可配置 OpenAI 兼容接口（Base URL / API Key / 模型名，存 `chrome.storage.sync`）。  
   - 仍无模型时：仅用标题+摘要的关键词启发式，并在侧边栏提示状态。

4. **快速搜索（P1 / 可选，默认关闭）**  
   - 在侧边栏「功能开关」中启用后可用。  
   - 按标题 / URL 搜索打开的标签与最近关闭记录；快捷键 **Ctrl+Shift+K** / **⌘⇧K** 打开侧边栏。

5. **侧边栏 UI**  
   - 使用 `chrome.sidePanel`；点击工具栏图标（或快捷键）打开并占满浏览器侧栏。  
   - 不再使用 action popup。  
   - 界面语言：设置页可选 **跟随浏览器 / 中文 / English**（`uiLocale`，默认跟随浏览器，否则中文）。

## 如何加载（Load unpacked）

1. 打开 Chrome，地址栏进入 `chrome://extensions`。  
2. 右上角打开 **开发者模式**。  
3. 点击 **加载已解压的扩展程序**，选择本仓库目录：

   ```text
   /workspace/smart-tab-pilot
   ```

   （若你已把项目拷到本机，选择包含 `manifest.json` 的那一层文件夹。）

4. 固定工具栏图标，**点击图标**即可在浏览器右侧打开侧边栏并配置（也可使用 Ctrl/⌘⇧K）。

修改代码后，在扩展管理页点击该扩展的 **重新加载**。

## Gemini Nano / Prompt API 要求

- 需要支持 [Prompt API](https://developer.chrome.com/docs/ai/prompt-api)（`LanguageModel`）的较新 Chrome。  
- 部分环境需开启相关实验旗标，并允许下载端侧模型。  
- 首次使用若状态为「可下载」，请在侧边栏中点击 **下载 / 启用 Nano 模型**（必须由用户点击触发）。  
- 若 Nano 不可用，请填写自定义 OpenAI 兼容端点，或依赖启发式分组。

## 如何打开侧边栏

1. 加载扩展并固定工具栏图标。  
2. **点击工具栏图标** → Chrome 打开本扩展侧边栏（占满侧栏区域）。  
3. 或按 **Ctrl+Shift+K** / **⌘⇧K**（`commands._execute_action`，可在 `chrome://extensions/shortcuts` 修改）。  
4. 修改代码后：在 `chrome://extensions` 点 **重新加载**，必要时关掉再点开侧边栏。

## 侧边栏说明

| 控件 | 作用 |
|------|------|
| 快速搜索 | 搜索打开的标签与最近关闭；↑↓ 选择，Enter 激活/重开 |
| 快捷键 | Ctrl+Shift+K / ⌘⇧K 打开侧边栏（可在 `chrome://extensions/shortcuts` 修改） |
| Nano 状态 | 显示 available / downloadable / downloading / unavailable / API 缺失 |
| 下载 Nano | 在可下载时触发 `LanguageModel.create()` |
| 精确 URL 去重跳转 | 开关去重 |
| 去重时忽略 hash | 默认关闭＝含 hash 精确匹配 |
| 任务视图 | 按任务导航图列出标签；窗口徽章；点行跳转 |
| 全部窗口 / 仅当前窗口 | 默认全部窗口；切换会保存 |
| 立即整理任务 | 按当前范围抽取 + 建图 + 各窗物理进组 |
| 拖到另一任务上合并 / 拆成独立任务 | 任意一对任务或把标签拖进目标任务；加强该对学习权重 |
| 自动按任务归组 | 页面 load complete 后按任务导航图进组 |
| 自定义模型字段 | Base URL / API Key / 模型名（只给任务命名，不按域名并组） |
| 关闭本组 | 按当前窗口范围关闭该逻辑任务下的标签 |
| 界面语言 | 跟随浏览器 / 中文 / English；选择会持久化 |

## 目录结构

```text
smart-tab-pilot/
├── manifest.json
├── LICENSE                 # MIT
├── README.md
├── _locales/               # CWS / chrome.i18n（en + zh_CN）
├── icons/                  # 扩展图标
├── background/
│   ├── service-worker.js   # MV3 入口
│   ├── dedupe.js           # 精确 URL 去重
│   ├── grouping.js         # 任务簇调度 + 按窗 tabGroups
│   ├── tab-lineage.js      # 存活 opener / 时间 / referrer
│   ├── tab-summaries.js    # 短摘要落盘（禁全文）
│   ├── nav-memory.js       # 关闭落 prior + 反馈扩展点
│   ├── classifier.js       # Nano / 自定义 / 启发式（命名 + 同组钩子）
│   ├── recent-closed.js    # 关闭标签追踪（storage.local）
│   └── search.js           # 打开/关闭标签快速搜索
├── content/
│   └── extract.js          # 紧凑文本快照抽取
├── sidepanel/
│   ├── sidepanel.html      # 侧边栏 UI（主入口）
│   ├── sidepanel.js
│   └── sidepanel.css
├── docs/
│   ├── chrome-web-store/             # 商店文案 / 权限 / 隐私草稿
│   ├── smart-tab-pilot-mvp/          # MVP 门禁文档
│   └── task-graph-cross-window/      # 任务导航图 + 跨窗口
├── scripts/
│   └── pack-extension.mjs            # npm run pack → artifacts/*.zip
├── popup/                  # 旧弹窗（未使用，仅对照）
└── shared/
    ├── i18n.js             # 侧栏 zh/en 文案 + t()
    ├── constants.js
    ├── storage.js
    ├── url-utils.js
    ├── url-pattern.js      # 学习边用的 origin+path 模式
    ├── nav-priors.js       # prior 加减权
    ├── task-graph.js       # 任务导航图 union-find
    ├── project-affinity.js # 产品 slug / 本地同源
    ├── tab-summary.js      # 短摘要纯函数
    ├── model-group-judge.js
    ├── physical-groups.js  # 同窗同名组合一
    └── dedupe-match.js     # 跨窗口精确 URL 匹配
```

## 权限

- `tabs` / `tabGroups` / `scripting` / `storage` / `sessions` / **`sidePanel`**  
- `host_permissions`: `<all_urls>`（用于正文抽取）  
- `side_panel.default_path`: `sidepanel/sidepanel.html`  
- `action`：**无** `default_popup`；`setPanelBehavior({ openPanelOnActionClick: true })`  
- `commands`: `_execute_action` → Ctrl+Shift+K / ⌘⇧K 打开侧边栏

## 注意事项 / Caveats

- **Service Worker 休眠**：MV3 后台可能被挂起；下次事件会唤醒。长时间空闲后首次分类可能稍慢。  
- **受限页面**：`chrome://` 等无法注入；去重与分组会跳过。  
- **CSP / 沙箱页**：个别站点可能阻止脚本注入，此时会尝试 `scripting.executeScript` 回退抽取。  
- **Nano 可用性因设备而异**：不支持时请配自定义模型。  
- **自定义 API Key** 存在 `chrome.storage.sync`，请勿在不受信环境使用生产密钥。  
- **最近关闭列表**：扩展安装前已关闭的标签依赖 `chrome.sessions`；之后关闭的由本扩展追踪。去重关闭的重复标签不会写入「最近关闭」。  
- **快捷键冲突**：若 Ctrl/⌘⇧K 未生效，请到 `chrome://extensions/shortcuts` 手动绑定。  
- **无构建产物**：本仓库为纯 JS，没有 `package-lock.json` / bundler。

## 致谢 Acknowledgments

页面正文的紧凑抽取思路受 [alibaba/page-agent](https://github.com/alibaba/page-agent) 启发：该项目通过 **文本化 / 脱水 DOM**（`packages/page-controller` 的 flat DOM tree），而非截图，让廉价文本模型即可理解页面，从而降低成本。

本扩展**没有**引入或 vendoring 整套 page-agent Agent 栈；仅借鉴其「文本 DOM 快照」理念，自行实现了轻量抽取（语义主区域 `article`/`main`、标题层级、剥离 nav/footer 噪音、硬字符上限），供标签主题分类使用。

## License

[MIT](./LICENSE)

## Chrome Web Store 打包

不要把 zip 提交进 git。在仓库根目录：

```bash
npm test
npm run pack
```

产物：`artifacts/smart-tab-pilot-<manifest.version>.zip`（当前为 `artifacts/smart-tab-pilot-1.5.0.zip`）。只含 MV3 运行时：`manifest.json`、`background/`、`sidepanel/`、`shared/`、`content/`、`icons/`、`_locales/`、`LICENSE`。不含 `tests/`、`docs/`、`.git/`、`node_modules/`、`popup/`。无系统 `zip` 时回退到 Python 或纯 Node。

商店文案、权限理由与隐私政策见 `docs/chrome-web-store/`。公开隐私页：

https://biubiuhu.github.io/smart-tab-pilot/chrome-web-store/privacy.html

本仓库不代为登录开发者后台。

## 开发自检

```bash
npm test
```

手工清单见 `docs/smart-tab-pilot-mvp/05-testing/manual-checklist.md` 与 `docs/task-graph-cross-window/05-testing/manual-checklist.md`。

任务导航图设计见 `docs/task-graph-cross-window/01-product/PRD.md`。
