# 任务导航图 + 跨窗口 — 手工清单

扩展版本：`1.4.0`。**以 `npm test` 为准**。TC-TASK-05 / 模型同组入参 / 截图「Bettr Promotion vs 批量发奖demo」已由 Node 仿真覆盖。下列条目是逻辑对照，不是给用户的手工验收清单。

## 去重（P0，跨窗口）

| ID | 步骤 | 期望 |
|----|------|------|
| TC-DEDUP-01 | 开去重；同窗两次打开 `https://example.com/` | 只留 1 个；焦点在旧标签 |
| TC-DEDUP-06' | 窗口1 打开 A；窗口2 再开 A | **聚焦窗口1 的 A，关闭窗口2 新标签** |
| TC-DEDUP-02 | 关去重；重复开 | 2 个标签 |
| TC-DEDUP-03 | ignoreHash 关；`/p#1` 与 `/p#2` | 2 个标签 |
| TC-DEDUP-05 | `chrome://version` | 不去重、不崩 |

## 任务导航图

| ID | 步骤 | 期望 |
|----|------|------|
| TC-TASK-01 | 在文章页用链接打开 2 个不同站点页 | 侧栏同一任务（来源边）；Chrome 组名可用主题 |
| TC-TASK-02 | 同域打开两篇无关文章，间隔 > 1 分钟，无互相点击 | 两个任务；组名不是 GitHub/域名 |
| TC-TASK-03 | 同窗 10 秒内打开两篇主题明显不同的同域页（地址栏，无 opener） | 仍两个任务 |
| TC-TASK-04 | 从 issue 点开 docs，关标签后再开同类 issue+docs | 第二次更可能并成一任务（学习边） |
| TC-TASK-05 | 把「批量发奖demo」任务卡拖到「Bettr Promotion」上（自动化：`tests/drag-merge.test.mjs`） | 任意一对合并（不限上一张）；反馈 +0.35；拆分仍可用 |
| TC-TASK-06 | 「拆成独立任务」 | 会话内不再并回 |
| TC-TASK-11 | 任务卡「关闭本组」（自动化：`tests/close-group.test.mjs`） | 全部窗口关该逻辑任务全部标签；仅当前窗口只关本窗；已关闭 id 跳过；会话 tabId 边清除；面板刷新 |
| TC-UI-01 | 标题栏「设置」切到设置页（自动化：`tests/settings-panel.test.mjs`） | 任务列表隐藏；「返回任务视图」恢复；窗口范围留在任务视图；Nano / 其它开关只在设置页 |
| TC-TASK-07 | 同端口 `127.0.0.1` 多个 demo | 无模型时不靠 regex 硬并；有 Nano/自定义且摘要同类 → 一个任务 |
| TC-TASK-08 | Unio + Marmot + Marketing console + `ac.alipay.com/page/bettr-promotion`（可跨窗） | 侧栏 **一个**「Bettr Promotion」（不要 Unio/Marketing 分簇）。**不是因为窗口才拆开** |
| TC-TASK-09 | 同窗已有「LinkE」组，再整理相邻同名标签 | **仍只有一个**「LinkE」物理组；「BIGP一期 迭代」同理，不得并排两个同名组 |
| TC-TASK-10 | 打开若干页后看 `chrome.storage.session.tabSummaries` | 每标签只有 title / pathKey / slugs / 短 excerpt；无整页正文 |

## 跨窗口视图

| ID | 步骤 | 期望 |
|----|------|------|
| TC-WIN-01 | 默认「全部窗口」；两窗各开标签 | 侧栏都能看到；带窗口徽章 |
| TC-WIN-02 | 切「仅当前窗口」 | 只列当前窗 |
| TC-WIN-03 | 点另一窗口的任务行 | 该窗前置并激活对应标签 |
| TC-WIN-04 | 「立即整理任务」在全部窗口 | 各窗各自出现 tabGroups，标签不搬窗 |
| TC-WIN-04b | 几十个 http(s) 标签 + 若干 `chrome://`，点「立即整理任务」 | 先快速成组；进度条走到 **n=N**（N=未缓存合格页，不含 chrome://）；按钮在结束后恢复；挂死页只跳过该页 |
| TC-WIN-05 | 把一个 opener 子标签拖到新窗口 | 逻辑任务仍可跨窗（徽章「跨窗口（逻辑）」） |

## 模型阶梯（不回退）

| ID | 步骤 | 期望 |
|----|------|------|
| TC-MODEL-03 | 无 Nano + 无自定义 | 任务图仍工作；主题名启发式；页脚提示 |
