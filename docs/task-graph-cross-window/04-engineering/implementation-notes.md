# 任务导航图 + 跨窗口 — 实现说明

## 1. 落点（对照代码）

| 能力 | 文件 | 备注 |
|------|------|------|
| Union-find 任务簇 | `shared/task-graph.js` | `buildTaskClusters` / `recordSessionFeedback` |
| Prior 加减权 | `shared/nav-priors.js` | `bumpPrior` / `applyFeedbackToPriors` |
| URL 模式 | `shared/url-pattern.js` | 数字 / uuid / hex / `ABC-42` → `*` |
| 跨窗去重匹配 | `shared/dedupe-match.js` | 无 Chrome API，可单测 |
| 活边 | `background/tab-lineage.js` | `onCreated` / `onUpdated` / `onAttached` |
| 关闭落盘 + 反馈 API | `background/nav-memory.js` | `recordClosePriors` / `applyTaskFeedback` |
| 调度与物理组 | `background/grouping.js` | `groupTabs` / `getTaskView` / `placeTabsInGroup` |
| 去重副作用 | `background/dedupe.js` | 全窗口 query |
| referrer | `content/extract.js` | `TAB_NAV_HINT` |
| 侧栏 | `sidepanel/*` | 全部窗口 / 仅当前窗口；合并/拆分 |

## 2. 算法草图（已实现，非假设）

```text
nodes = tabs + lineage + semanticLabel
UF = {}

union sessionMerges          // 用户反馈
union openerTabId            // 强：标签树，可跨窗（lineage）
union referrer → 打开中 URL  // 强-中：点击来源
union time-adjacent          // 中：同窗 + createdAt 差 ≤ 45s + 主题兼容
union learned prior ≥ 0.35   // 弱：历史 opener/时间/反馈
forbid sessionSplits

if 弱簇主题混杂 and 无强边跨主题: split by topic
label = majority semantic topic
physical = group by (cluster, windowId)
```

Chrome `tabs.Tab` **没有** `createdAt`，时间边只使用本扩展观察到的 `onCreated`。

## 3. 学习如何变强

1. 用户从 Linear issue 点开 oncall runbook（opener）。
2. 关闭任一侧 → `navPriors` 中  
   `linear.app/…/issue/* || docs…/oncall/runbook` 权重 +0.2。
3. 再发生一次同类 opener → 0.4 ≥ 0.35。
4. 以后即使 opener 丢失（SW 重启、从地址栏打开相似路径），主题兼容时仍并入同一任务。

用户点「与上一任务合并」会立刻 `+0.35` 并写入会话强边；「拆成独立任务」写会话禁边并减权。

## 4. 反馈扩展点（给后续加厚学习）

稳定入口：

- 消息：`MSG.TASK_FEEDBACK`
- 函数：`applyTaskFeedback({ action, tabIds, urlsA, urlsB })`
- 纯函数：`recordSessionFeedback` + `applyFeedbackAcrossUrlSets`

后续可以在不改聚类主循环的前提下接入：拖拽并组、负反馈衰减、按窗口的 prior。

## 5. 「立即整理」失败软化

- 批量整理**不再**对所有标签串行 `sendMessage` + `classifyPage`。任务簇先用 lineage / 缓存 / 标题启发式。
- 最多 `LABEL_REFRESH_BATCH`（6）个未缓存页并行抽取（并发 3），单页 `EXTRACT_TIMEOUT_MS`（2s）超时则回退标题启发式。
- `extractPageContent` / 单标签 `classifyPage` 均 `Promise.race` 超时，受限页或挂死的 content script 不会卡住 SW。
- 侧栏 `send` 有 `GROUP_RPC_TIMEOUT_MS`（20s）硬超时；`onGroupNow` 的 `finally` 一定恢复按钮。进度文案：`已处理 n/N`。

## 6. 验证命令

```bash
npm test
```

覆盖：opener 混主题仍一团、同域不同主题拆开、时间+冲突主题不并、学习边、反馈 merge/split、跨窗 URL 匹配、浅模式拒绝。

## 7. 手工要点

见 `05-testing/manual-checklist.md`。本环境无真实 Chrome 扩展宿主，物理 `tabGroups` / 侧栏需 Load unpacked 验收。
