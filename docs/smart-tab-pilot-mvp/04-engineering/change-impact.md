# Smart Tab Pilot 变更影响分析

## 0. 版本历史

| 版本 | 日期 | 变更内容 | 变更原因 | 影响 |
|------|------|----------|----------|------|
| v0.1 | 2026-11-03 | 对照 scaffold 与 MVP 文档的影响面 | manual-gated；本轮仅 docs | 编码前基线 |

## 1. 当前结论

- 影响范围：**单仓库** `/workspace/smart-tab-pilot` Chrome MV3 扩展
- 是否跨 repo：**否**
- 是否改接口契约：**否**（无后端；内部 MSG 已存在）
- 是否需要迁移：**否**（无 DB）；设置字段已有默认值合并
- 是否影响客户端版本：扩展 `manifest.version` 当前 `1.1.0`；审核后若收敛搜索可能升 patch/minor
- 回滚复杂度：**低**（Git revert / 卸载扩展 / 关开关）
- 本轮实际变更：**仅文档**；产品代码冻结至用户审核通过

## 2. 受影响对象

| 对象 | 是否影响 | 说明 | 验证方式 |
|------|----------|------|----------|
| repo `smart-tab-pilot` | 是（docs） | `docs/smart-tab-pilot-mvp/**` | git diff --docs |
| popup / background / content | 否（本轮） | scaffold 已含 MVP 能力 + ahead 搜索 | 审核后 backlog |
| API/契约 | 否 | 无对外 HTTP API | — |
| 数据表/迁移 | 否 | — | — |
| 缓存/队列/定时 | 弱 | debounce timer、SW 生命周期 | 手工 |
| 环境变量/配置 | 否 | 无 `.env`；用户弹窗配置 | — |
| 对象存储/第三方 | 可选 | 用户自备 OpenAI 兼容 | 配置后分组 |
| 预发/线上发布 | 否（本轮） | 仅 Load unpacked 说明 | ops 文档 |

### Scaffold vs MVP Gaps

| 模块 | Scaffold 状态 | MVP 需要 | Gap / 备注 |
|------|---------------|----------|------------|
| `dedupe.js` | 已实现精确去重 | P0 | 对齐；补测试 |
| `grouping.js` + extract | 已实现 | P0 | 对齐；样例页验收 |
| `classifier.js` | Nano/custom/heuristic | P0 | 对齐 |
| popup 开关/Nano/自定义/立即分组 | 已有 | P0 | 对齐 |
| `search.js` + recent-closed + 搜索 UI | **已有** | **非 MVP** | **ahead-of-scope**：勿扩展；可选后续收敛 |
| 自动化测试 | 无 | P0 去重验收策略 | 缺口 |
| Web Store 物料 | 无 | 非本轮必达 | 缺口（ops 预留） |

## 3. 接口和兼容性

- 新增接口：无
- 修改接口：无（本轮）
- 删除接口：无
- 错误码变化：无
- 旧客户端兼容：仅扩展自身；无服务端版本矩阵
- feature flag：设置项即开关（`exactDedupeEnabled` 等）

## 4. 数据和迁移

- 数据模型变化：无强制迁移；`getSettings` 与 defaults 合并
- 迁移命令：无
- 幂等策略：去重防重入；分组按 label 合并
- 回滚策略：revert commit；清除 `chrome.storage` 可选
- 数据校验：URL normalize；label sanitize ≤32 字符

## 5. 风险和回滚

| 风险 | 影响 | 预防措施 | 回滚方式 |
|------|------|----------|----------|
| 文档与 README 仍宣传搜索 | 用户以为 MVP 含搜索 | PRD/UI 标明 P1；审核后改 README | 文档修正 |
| 误关「旧」标签而非新标签 | 丢上下文 | 验收用例强制断言；代码已 update 已有再 remove 新 | 关去重；revert |
| 自定义 Key 泄露 | 隐私/资损 | password 框；文档警告；不进 git | 用户轮换 Key |
| Nano 不可用导致分组质量差 | 体验 | 阶梯 + 启发式；UI 提示 | 配自定义模型 |
| 改代码未经审核 | 门禁破坏 | manual-gated；本轮只 commit docs | — |

## 6. 验证责任

| 验证项 | 负责环节 | 证据路径 |
|--------|----------|----------|
| 文档包完整性 | 产品/架构 | `docs/smart-tab-pilot-mvp/**` |
| P0 去重验收 | QA（批准实施后） | `05-testing/test-strategy.md` → 未来 test-report |
| 分组/模型阶梯 | QA + 研发 | 截图 / sources 统计 |
| 搜索 | 不验证 MVP | backlog P1 |
