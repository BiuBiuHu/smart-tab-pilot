# Smart Tab Pilot 实施计划

## 0. 版本历史

| 版本 | 日期 | 变更内容 | 变更原因 | 影响 |
|------|------|----------|----------|------|
| v0.1 | 2026-11-03 | 对齐 scaffold；划分审核后阶段 | manual-gated | 编码等待用户审核 |
| v0.2 | 2026-11-03 | 批准后编码：去重加固、禁域名聚合、搜索默认关 | 用户批准 + 硬约束 | feature 分支实现 |

## 1. 当前决策

- 当前实施策略：**文档已批准 → 在 `feature/smart-tab-pilot-mvp` 实现 P0（去重 + 正文语义分组；禁止域名聚合）**
- 当前阶段划分：
  1. 文档门禁（本轮）
  2. 批准后：P0 验收补强 / 缺口修复（测试、文档与代码描述收敛）
  3. P1：搜索产品化
- 当前依赖关系：需求验证 → PRD/UI/架构 → 本计划/backlog →（批准）实现循环 → 测试报告

## 2. 项目发现

- 相关 repo：`/workspace/smart-tab-pilot`（单仓）
- 包管理器：无运行时依赖；`package.json` 仅元数据，`scripts` 为空
- 启动命令：Chrome → `chrome://extensions` → 开发者模式 → **加载已解压的扩展程序** → 选仓库根目录
- 测试命令：尚无（待补）
- lint/typecheck：无强制；JSDoc 注释存在
- dev server 和端口：无
- 环境变量样例：无；弹窗配置自定义模型
- 当前分支：`master`
- 未提交改动：以提交时 `git status` 为准（本轮预期仅 docs）
- 扩展版本：`1.1.0`
- 代码保存点：`0cd66b6`（OPC Skills 门禁前）

## 3. 保存点

- 保存方式：Git commit
- 已有保存点：`0cd66b6 chore: save point before OPC Skills gated docs…`
- 本轮文档提交：`docs: complete smart-tab-pilot-mvp gated package for review`
- 回滚方式：`git checkout` / `git revert` 文档提交；产品代码未改则无需回滚实现

## 4. 变更清单

### 4.1 本轮（仅文档）

| 模块/文件 | 改动 | 原因 | 验证方式 |
|-----------|------|------|----------|
| `docs/smart-tab-pilot-mvp/00-research/competitor-research.md` | 新建 | 开源/竞品门禁 | 文件存在 |
| `docs/.../01-product/*` | 更新 PRD + 需求验证 | 冻结范围 | 状态 awaiting-user-review |
| `docs/.../02-ui/markdown-prototype.md` | 填写 | 弹窗与行为 | 审阅 |
| `docs/.../03-architecture/architecture.md` | 填写 | MV3/模型/抽取 | 审阅 |
| `docs/.../04-engineering/*` | 填写 | scaffold vs gaps | 审阅 |
| `docs/.../05-testing/test-strategy.md` | 填写 | P0 去重 | 审阅 |
| `docs/.../06-ops/*` | 更新 | Load unpacked / 商店预留 | 审阅 |
| `background|content|popup|shared|manifest` | **不改** | 门禁 | `git diff` 无代码文件 |

### 4.2 批准编码后（候选，不自动执行）

| 模块/文件 | 改动 | 原因 | 验证方式 |
|-----------|------|------|----------|
| 测试脚本或手工清单固化 | 新增 | P0 去重可复跑 | test-report |
| README / popup 文案 | 可选收敛搜索表述 | 与 PRD 一致 | 文案 diff |
| manifest `sessions` / 搜索 UI | 可选收敛 | 权限最小化 | 回归去重+分组 |

## 5. 执行顺序

| 阶段 | 任务 | 退出条件 | 失败处理 |
|------|------|----------|----------|
| A | 写完 docs 包并 commit | 用户可审阅；status awaiting-user-review | 补文档 |
| B | 用户审核 | 明确「审核通过/开始编码」等 | 停在文档迭代 |
| C | P0 手工/自动去重验收 | REQ-001 全过 | 修 dedupe，禁止扩 scope |
| D | 分组+模型阶梯抽检 | REQ-002/003 过 | 修 classifier/extract |
| E | （可选）收敛 ahead-of-scope UI | 与 PRD 对外描述一致 | 单独 commit |
| F | P1 搜索正式纳入 | 另开版本/修订 PRD | — |

## 6. 自动执行循环（批准后）

- 每轮修改：最小文件集，先去重后分组
- 最小验证：Load unpacked → 重复开链用例；再跑立即分组
- 失败归因：`[layer] dedupe|extract|classify|tabGroups|ui` + 现象
- 复验方式：同一 URL 样例与同一窗口
- 证据写入：`05-testing/test-report.md` + `04-engineering/evidence-manifest.md`

## 7. 兼容、迁移与回滚

- 无服务端迁移
- 设置向后兼容 defaults 合并
- 回滚：关开关或卸载；Git revert

## 8. 风险与未解决问题

- Scaffold 已含搜索，易在实施时「顺手增强」—— **禁止**，除非修订 PRD
- 无自动化测试基础设施——批准后优先补 P0 去重可重复步骤
