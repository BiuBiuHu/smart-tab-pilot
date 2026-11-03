# Smart Tab Pilot MVP PRD

## 0. 版本历史

| 版本 | 日期 | 变更内容 | 变更原因 | 影响 |
|------|------|----------|----------|------|
| v0.1 | 2026-11-03 | 完整 MVP PRD | 目标澄清已冻结；需求验证判定可进 PRD | 进入 awaiting-user-review；约束后续实现与验收 |
| v0.2 | 2026-11-03 | 硬约束：同域不同主题必须分不同组；搜索默认关闭 | 用户编码批准 + 产品纠偏 | 分类/启发式禁止域名聚合 |
| v0.3 | 2026-11-03 | 配置 UI 改为 Chrome side panel（占满侧栏），去掉 action popup | 用户反馈弹窗体验差 | manifest `sidePanel` + `sidepanel/` |
| v0.4 | 2026-11-03 | 增量：任务导航图 + 跨窗口逻辑聚合 + 跨窗口去重 | 见 `docs/task-graph-cross-window/` | 本文件仅修订冲突条款 |

## 1. 当前决策

- 当前产品决策：
  - **MVP 首要成功标准**：精确 URL 去重跳转（激活已有同 URL 标签，关闭新标签）。
  - **MVP 含**：基于**页面正文**的语义分组（非域名）+ 模型阶梯（Nano → 自备 OpenAI 兼容 → 启发式）+ 文本 DOM 抽取 + **侧边栏配置 UI**（Chrome `sidePanel`，非 popup）。
  - **开源 MIT**；Load unpacked 为首发形态。
- 被拒绝的替代方案：
  - 以「域名分组」或「固定分类表」作为 MVP 主路径。
  - 以 Workspace / Snooze / 休眠 / 商店付费档作为 MVP。
  - Vendor 整套 `alibaba/page-agent` Agent 栈。
  - 将快速搜索作为 MVP 验收项（虽代码已存在）。
- 当前范围边界：单机 Chrome MV3 扩展；无自有后端；可选用户配置的出站 OpenAI 兼容 API。
- **门禁状态：`approved-for-implementation`**（用户已批准编码；实现中）

## 2. 需求验证结论

- 需求验证文档：`01-product/requirement-validation.md`
- 竞品调研：`00-research/competitor-research.md`
- 已消除的歧义：MVP 首要成功=精确去重；语义分组进 MVP；搜索=P1；开源与抽取边界
- 仍需确认的问题：popup 搜索 UI 是否在批准编码后收敛；商店上架时机
- 不进入本版本的内容：快速搜索产品化验收、跨设备同步、规则引擎、Workspace；用户改组学习仅提供 merge/split 扩展点（见任务导航图）

## 3. 目标澄清

- 用户真正想完成的业务结果：不再因为重复打开同一链接而堆积标签；相关主题的标签自动收进可读的 Chrome 标签组。
- 主要用户/角色：重度 Chrome 用户（研发 / 调研）
  - 核心工作流：开链 → 去重跳转（现含跨窗口）；浏览完成加载 → 任务导航图进组；侧栏可看全部窗口
  - 工作单元和批量范围：单标签事件；按窗口物理整理；逻辑任务可跨窗
- 成本、时效和质量约束：端侧优先；正文截断；分类输出短标签；去重应在导航后尽快完成（体感「立刻」）
- 返工/重试/回滚方式：开关关闭；重新分组；卸载扩展恢复默认浏览器行为
- 用户已确认结论：见需求验证 §2

## 4. 用户、问题与场景

### 4.1 用户与角色

- 终端用户：安装扩展的 Chrome 使用者
- 维护者：开源贡献者 / 本地加载调试者

### 4.2 要解决的问题

1. 重复打开同一 URL，标签条膨胀，找不到「真正在看的那页」。
2. 多主题并行时，仅靠域名或手动拖组成本高；希望按**内容主题**归组。
3. 设备是否支持 Nano 不确定，需要可预期的降级路径。

### 4.3 触发场景和使用频率

- 高频：从搜索结果、文档、聊天中再次打开已打开的链接（去重）。
- 中频：一天内堆叠数十标签后希望自动或一键按主题归组。
- 低频：首次配置 Nano 下载或填写自定义模型。

### 4.4 当前替代方案和痛点

- 手关重复标签 / OneTab 类工具：打断心流，非「打开即归位」。
- TabAutopilot / Takt：能力全但闭源或范围过大；本产品聚焦开源 MVP 主路径。
- 仅域名分组：同域多主题或跨域同主题时失败。

## 5. 范围

### 5.1 In Scope（MVP）

1. 精确 URL 去重跳转（默认匹配含 hash；设置可忽略 hash）。**增量后为全窗口跳转**，见 `docs/task-graph-cross-window/`。
2. 跳过 `chrome://`、`chrome-extension://`、`about:`、`edge://`、`devtools://`、`view-source:` 等。
3. **分组硬约束**：标签组标题来自页面正文/标题语义；**禁止按域名/站点聚合**。同一域名下不同主题的标签必须进入不同组。
4. Content Script + 注入回退的紧凑文本抽取（标题、语义主区域、h1–h3、可见正文，去噪，≤~4000 字符）。
5. 自动分组改为**任务导航图**（opener / 时间 / 学习边；语义只精炼与命名）。
6. `chrome.tabGroups` **按窗口**写入；侧栏逻辑任务可跨窗。不同任务即使主题名相同也不并组。
7. 模型阶梯与侧边栏状态：Nano availability、downloadable 用户手势下载、OpenAI 兼容字段、启发式回退提示。
8. 设置持久化：`chrome.storage.sync`（含 `quickSearchEnabled` 默认 false）。
9. README Load unpacked 说明；MIT 许可。

### 5.2 Out of Scope（本版本不验收）

- **快速搜索打开/关闭标签**（P1；现有代码视为 ahead-of-scope，不扩展、不作为 MVP 失败条件）
- 忽略 query/追踪参数的复杂匹配矩阵（跨窗口精确去重已纳入增量）
- 规则引擎、固定分类表、用户改组学习
- Workspace / Snooze / 休眠 / 内存悬浮
- 自有后端、账号、云同步
- Vendor page-agent
- Firefox / 非 Chromium（可后续）

### 5.3 权限和环境范围

- 权限：`tabs`、`tabGroups`、`scripting`、`storage`、`sidePanel`；MVP 语义上不依赖搜索，但当前 scaffold 另含 `sessions`（服务于 ahead-of-scope 搜索，审核后决定是否收敛）
- `host_permissions`: `<all_urls>`（正文抽取）
- 环境：Chrome（支持 MV3；Nano 需较新版本与兼容硬件）

## 6. 核心流程

### 6.1 主流程

**A. 精确去重（P0）**

1. `tabs.onUpdated` 出现 `url` 或 `status=complete`。
2. 若去重开启且 URL 非跳过列表：规范化 URL（按 `ignoreHash`）。
3. **全窗口**查询其它标签，命中相同规范化 URL → `tabs.update(已有, active)` → 聚焦该窗口 → `tabs.remove(新)`。
4. 去重关闭的标签不记入「最近关闭」（实现已 suppress）。

**B. 语义分组（P0）**

1. 去重未关闭该标签且自动分组开启、页面 complete。
2. Debounce 后抽取文本快照 → `classifyPage`（Nano → custom → heuristic）。
3. `placeTabsInGroup`：按标签名大小写不敏感匹配已有组，否则创建并着色。

**C. 配置（P0）**

1. 用户点击工具栏图标（或快捷键）打开 Chrome side panel。
2. 查看 Nano 状态；若 downloadable，点击下载（用户手势）。
3. 切换开关 / 保存自定义模型 / 立即分组。

### 6.2 状态流转

- 去重：启用 ↔ 禁用（设置）
- Nano：missing → unavailable | downloadable → downloading → available
- 分组来源标签：`nano` | `custom` | `heuristic`（用于结果反馈，不必对用户暴露全部细节）

### 6.3 异常、空态和失败路径

- 内部页：跳过
- 抽取失败：用 title/url 启发式仍尝试进组
- 自定义 API 失败：降级启发式并 console 警告
- Service Worker 休眠：下一事件唤醒；可接受轻微延迟

### 6.4 成本保护和返工流程

- 正文截断；分类 prompt 只要短标签；`max_tokens` 限制
- 用户可关自动分组，仅手动「立即分组」
- 卸载或关开关即停止副作用

## 7. 验收标准

| 需求 ID | 验收标准 | 证据类型 | 优先级 |
|---------|----------|----------|--------|
| REQ-001 | 重复打开相同 URL（默认含 hash 一致）时，激活已有标签（**可跨窗口**）并关闭新标签；开启 ignoreHash 后仅 hash 不同也去重 | 手工 Chrome 步骤 + 录屏/截图 | P0 |
| REQ-002 | 自动或「立即分组」后，标签进入以主题命名的 tabGroup；主题来自正文/标题；**同域不同主题必须分到不同组**（禁止域名聚合） | 截图 + 可选分类 source 统计 | P0 |
| REQ-003 | 侧边栏展示 Nano 状态；downloadable 可点下载；无 Nano 时配置自定义模型后分组 source 可为 custom，否则 heuristic 且有提示 | 截图 | P0 |
| REQ-004 | 抽取为纯文本快照，长度受上限约束；灵感来源声明不引入 page-agent 依赖 | 代码审查 + 样例页日志 | P0 |
| REQ-005 | 去重/自动分组开关、ignoreHash、自定义模型保存、立即分组结果文案可用 | 截图 | P0 |
| REQ-006 | 不作为 MVP 通过条件 | — | P1 |

## 8. 指标与版本节奏

### 8.1 成功指标

- P0：去重路径在手工验收用例 100% 通过（含内部页跳过、开关关闭不生效）。
- P0：至少 1 条「跨域同主题」样例在 Nano 或自定义模型下进入合理同组（启发式允许较弱）。
- 主观：重复开链时用户无需手动找旧标签。

### 8.2 版本路线

| 版本 | 内容 |
|------|------|
| MVP（本 feature） | 去重 + 语义分组 + 模型阶梯 + 抽取 + 弹窗配置 |
| vNext（P1） | 快速搜索产品化与验收（打开/最近关闭）；快捷键体验打磨 |
| Later | 匹配模式扩展、商店上架与隐私政策、可选收敛 sessions 权限 |

## 9. 未解决问题

- 批准编码后是否收敛 popup 搜索区与 `sessions` 权限以匹配 MVP 对外描述
- Web Store 上架是否单开 feature

## 10. 门禁

- **status: `approved-for-implementation`**
- 用户已批准编码；硬约束补充：同域不同主题分不同组
