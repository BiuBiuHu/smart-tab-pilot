# Smart Tab Pilot

Manifest V3 Chrome 扩展：**精确 URL 去重跳转** + **基于页面正文的语义标签分组**（同域不同主题分不同组，不按域名聚合）。UI 使用 Chrome **侧边栏（side panel）**占满浏览器侧栏；快速搜索为可选能力（侧边栏内默认关闭）。

纯前端 JS，无需构建步骤；可直接「加载已解压的扩展程序」。开源协议：[MIT](./LICENSE)。

## 功能

1. **精确 URL 去重**  
   同窗口内若已有标签页打开了相同 URL，则激活已有标签并关闭新标签。  
   - 默认 **精确匹配（含 hash）**：设置项 `ignoreHash` 默认为 `false`。  
   - 可在侧边栏中开启「去重时忽略 hash」。  
   - 跳过 `chrome://`、`chrome-extension://`、`about:`、`edge://` 等内部页。

2. **语义分组（按页面正文，而非域名）**  
   - Content Script 抽取紧凑的**文本 DOM 快照**（标题 + 语义主区域 + h1–h3 + 可见正文，去掉导航/页脚噪音，硬上限约 4000 字符）。  
   - Background 用 AI / 启发式打出短中/英文**主题**标签，并放入对应的 `chrome.tabGroups`（按标签名合并；**禁止**用 hostname/站点名并组）。  
   - **同域名下不同主题必须进入不同组。**

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

## 侧边栏说明（中文 UI）

| 控件 | 作用 |
|------|------|
| 快速搜索 | 搜索打开的标签与最近关闭；↑↓ 选择，Enter 激活/重开 |
| 快捷键 | Ctrl+Shift+K / ⌘⇧K 打开侧边栏（可在 `chrome://extensions/shortcuts` 修改） |
| Nano 状态 | 显示 available / downloadable / downloading / unavailable / API 缺失 |
| 下载 Nano | 在可下载时触发 `LanguageModel.create()` |
| 精确 URL 去重跳转 | 开关去重 |
| 去重时忽略 hash | 默认关闭＝含 hash 精确匹配 |
| 自动语义分组 | 页面 load complete 后自动分类并进组 |
| 自定义模型字段 | Base URL / API Key / 模型名 |
| 立即分组当前窗口 | 对当前窗口所有可访问标签立即抽取并分组 |

## 目录结构

```text
smart-tab-pilot/
├── manifest.json
├── LICENSE                 # MIT
├── README.md
├── icons/                  # 扩展图标
├── background/
│   ├── service-worker.js   # MV3 入口
│   ├── dedupe.js           # 精确 URL 去重
│   ├── grouping.js         # 抽取调度 + tabGroups
│   ├── classifier.js       # Nano / 自定义 / 启发式
│   ├── recent-closed.js    # 关闭标签追踪（storage.local）
│   └── search.js           # 打开/关闭标签快速搜索
├── content/
│   └── extract.js          # 紧凑文本快照抽取
├── sidepanel/
│   ├── sidepanel.html      # 侧边栏 UI（主入口）
│   ├── sidepanel.js
│   └── sidepanel.css
├── popup/                  # 旧弹窗（未使用，仅对照）
└── shared/
    ├── constants.js
    ├── storage.js
    └── url-utils.js
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

## 开发自检

```bash
npm test
```

手工清单见 `docs/smart-tab-pilot-mvp/05-testing/manual-checklist.md`。
