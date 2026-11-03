# Smart Tab Pilot Backlog

## 0. 版本历史

| 版本 | 日期 | 变更内容 | 变更原因 | 影响 |
|------|------|----------|----------|------|
| v0.1 | 2026-11-03 | 按 MVP P0 / ahead-of-scope / P1 分组 | 对齐冻结决策与 scaffold | 实施顺序基线 |

## 1. 当前决策

- 当前优先级策略：**P0 去重验收与稳定性 > P0 语义分组与模型阶梯 > 文档/权限收敛 > P1 搜索**
- 当前阶段重点：文档审核；**不编码**
- Scaffold 声明：搜索相关代码 = **ahead-of-scope（已实现但非本版本承诺；默认 `quickSearchEnabled=false`）**
- **硬约束**：同域不同主题必须分不同组；禁止域名聚合

## 2. 任务分组

| Epic | 目标 | 优先级 | 依赖 | 验收证据 |
|------|------|--------|------|----------|
| E-DOC | OPC 门禁文档包 | P0 | — | docs 目录 + awaiting-user-review |
| E-DEDUP | 精确去重跳转达标 | P0 | 用户批准编码 | test-strategy TC-DEDUP-* |
| E-SEM | 正文语义分组 + 模型阶梯 | P0 | 批准编码 | 分组截图 + sources |
| E-EXTRACT | 文本 DOM 抽取质量 | P0 | E-SEM | 样例页抽取 |
| E-ALIGN | 对外描述与权限和 PRD 对齐 | P1 | 批准 | README/popup/manifest diff |
| E-SEARCH | 快速搜索产品化 | P1 | 修订范围 | 另订验收 |
| E-STORE | Chrome Web Store | P2 | 隐私政策 | 商店listing |

## 3. 任务清单

| ID | 任务 | 影响模块 | 优先级 | 状态 | 退出条件 |
|----|------|----------|--------|------|----------|
| TASK-001 | 完成竞品/开源调研文档 | docs/00-research | P0 | done（本轮） | 文件可审 |
| TASK-002 | 完成需求验证+PRD+UI+架构+工程+测试+ops | docs/* | P0 | done（本轮） | awaiting-user-review |
| TASK-003 | 用户审核文档包 | — | P0 | done | 用户明确批准编码 |
| TASK-004 | P0 去重用例手工跑通并记录证据 | dedupe / QA | P0 | in-progress | TC-DEDUP 全过 + npm test |
| TASK-005 | 语义分组 + Nano/自定义/启发式抽检 | grouping/classifier | P0 | in-progress | REQ-002/003 + 同域分主题 |
| TASK-006 | 抽取样例页（文章/文档/SPA）回归 | extract.js | P0 | in-progress | 纯文本≤4k |
| TASK-007 | （可选）收敛搜索 UI/文案/sessions | popup/manifest/README | P1 | pending | 与 PRD 一致 |
| TASK-008 | 搜索产品化验收 | search/recent-closed | P1 | deferred | 新 PRD 修订 |
| TASK-009 | 商店上架准备 | ops | P2 | deferred | listing+隐私 |

## 4. 执行顺序和阻塞

```text
TASK-001/002 (docs) → TASK-003 用户审核
        ↓ 批准
TASK-004 去重 → TASK-005/006 分组与抽取
        ↓
TASK-007 可选对齐 → TASK-008/009 后续
```

阻塞：TASK-003 未完成前，禁止 TASK-004+ 改产品代码。

## 5. 验证映射

| 任务 ID | 需求 ID | 验证方式 | 证据路径 |
|---------|---------|----------|----------|
| TASK-004 | REQ-001 | 手工 Chrome | 05-testing/test-report.md（待建） |
| TASK-005 | REQ-002, REQ-003 | 手工 + 截图 | evidence-manifest |
| TASK-006 | REQ-004 | 日志/截取文本 | evidence-manifest |
| TASK-008 | REQ-006 | 后续 | — |

## 6. 未解决问题

- TASK-007 是否强制纳入「批准后第一批」由用户审核时勾选
