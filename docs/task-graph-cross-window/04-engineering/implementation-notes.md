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
| 项目亲和 | `shared/project-affinity.js` | slug / loopback 同端口 / origin+两段 path |
| 短摘要 | `shared/tab-summary.js` + `background/tab-summaries.js` | 导航刷新；禁全文落盘 |
| 模型同组钩子 | `shared/model-group-judge.js` | 规则之后；Nano/自定义可用才调用 |
| 同窗同名组 | `shared/physical-groups.js` | `coalesceWindowPlacements` / `pickReusableGroupId` |
| 去重副作用 | `background/dedupe.js` | 全窗口 query |
| referrer | `content/extract.js` | `TAB_NAV_HINT` |
| 侧栏 | `sidepanel/*` | 全部窗口 / 仅当前窗口；合并/拆分 |

## 2. 算法草图（已实现，非假设）

```text
nodes = tabs + lineage + semanticLabel
UF = {}

union sessionMerges          // 用户反馈
union extraUnions            // 模型同组（权威第二层，只加并；slug 不是权威）
union openerTabId            // 强：标签树，可跨窗（lineage）
union referrer → 打开中 URL  // 强-中：点击来源
// product key / loopback / prefix = candidate features ONLY
union time-adjacent          // 中：同窗 + createdAt 差 ≤ 45s + 主题兼容
union learned prior ≥ 0.35   // 弱：历史 opener/时间/反馈
forbid sessionSplits

if 弱簇主题混杂 and 无强边跨主题: split by topic
label = projectDisplayName || majority semantic topic
persist tabSummary(title, path/slug, 1–2句)  // 永不落盘全文
physical = coalesce by (windowId, normalize(label)) → 一窗一名一组
```

Chrome `tabs.Tab` **没有** `createdAt`，时间边只使用本扩展观察到的 `onCreated`。

## 3. 学习如何变强

1. 用户从 Linear issue 点开 oncall runbook（opener）。
2. 关闭任一侧 → `navPriors` 中  
   `linear.app/…/issue/* || docs…/oncall/runbook` 权重 +0.2。
3. 再发生一次同类 opener → 0.4 ≥ 0.35。
4. 以后即使 opener 丢失（SW 重启、从地址栏打开相似路径），主题兼容时仍并入同一任务。

用户把任务卡或标签拖到另一任务上合并，会立刻 `+0.35` 并写入该对会话强边；「拆成独立任务」写会话禁边并减权。模型同组入参为 **标题 + 完整 URL + 短摘要/导语**（外加便宜的 opener/referrer），不只靠 slug。

## 4. 反馈扩展点（给后续加厚学习）

稳定入口：

- 消息：`MSG.TASK_FEEDBACK`
- 函数：`applyTaskFeedback({ action, tabIds, urlsA, urlsB })`
- 纯函数：`recordSessionFeedback` + `applyFeedbackAcrossUrlSets`

后续可以在不改聚类主循环的前提下接入：拖拽并组、负反馈衰减、按窗口的 prior。

## 5. 「立即整理」两阶段（不全量放弃）

- **Pass 1（快）**：全部合格标签用 lineage / 缓存 / 标题启发式建任务图并立刻物理进组。
- **Pass 2（全量精炼）**：每一个未缓存合格标签都进入队列（`listUncachedEligibleTabs`，**无 6 页上限**），并发 3；单页抽取 2s 超时则该页回退启发式并继续。`chrome://` 不入队。
- 进度：`已处理 n/N` + 进度条，直到 `n=N`；每 6 页可回写组名。
- 按钮在全程可保持忙碌，但进度必须更新；`finally` 或 12s 无心跳则恢复按钮。

## 6. 验证命令

```bash
npm test
```

覆盖：opener 混主题仍一团、同域不同主题拆开、时间+冲突主题不并、学习边、反馈 merge/split、跨窗 URL 匹配、浅模式拒绝、Bettr 项目亲和、短摘要不落盘正文、同窗同名物理组合并。

## 7. 手工要点

见 `05-testing/manual-checklist.md`。本环境无真实 Chrome 扩展宿主，物理 `tabGroups` / 侧栏需 Load unpacked 验收。
