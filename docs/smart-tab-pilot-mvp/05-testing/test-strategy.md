# Smart Tab Pilot 测试策略

## 0. 版本历史

| 版本 | 日期 | 变更内容 | 变更原因 | 影响 |
|------|------|----------|----------|------|
| v0.1 | 2026-11-03 | 以 P0 去重验收为核心 | MVP 首要成功标准冻结 | 批准实施前不执行 |

## 1. 当前决策

- 当前测试范围：Chrome Load unpacked 下的 **P0 精确去重** + **P0 语义分组/模型阶梯抽检** + 抽取冒烟
- 当前测试优先级：REQ-001 ≫ REQ-002/003/004/005；REQ-006 **不测（非 MVP）**
- 当前发布门禁：无商店强制；本地验收通过后方可声称 MVP 功能完成；本轮仅文档

## 2. 需求到测试追踪

| 需求 ID | 验收标准 | 测试用例 ID | 证据 | 状态 |
|---------|----------|-------------|------|------|
| REQ-001 | 同 URL 激活旧标签并关新标签 | TC-DEDUP-01..06 | 录屏/截图 | 待测 |
| REQ-002 | 正文语义进组 | TC-GROUP-01..03 | 截图 | 待测 |
| REQ-003 | 模型阶梯与 UI 状态 | TC-MODEL-01..04 | 截图 | 待测 |
| REQ-004 | 文本抽取上限与纯文本 | TC-EXT-01..02 | 日志摘录 | 待测 |
| REQ-005 | 弹窗开关与立即分组 | TC-UI-01..03 | 截图 | 待测 |
| REQ-006 | 搜索 | — | — | **MVP 跳过** |

## 3. 测试范围

### 3.1 涉及系统

- Chrome MV3 扩展（background / content / popup）
- 可选：本机 LanguageModel；用户配置的 OpenAI 兼容端点（可用 mock/无效 Key 测降级）

### 3.2 不涉及系统和原因

- 自有后端 / DB / 对象存储：不存在
- 快速搜索、sessions 合并、快捷键聚焦搜索：**out of MVP**
- Firefox：非目标

## 4. 风险驱动测试重点

### 4.1 P0 风险

1. **误关旧标签**：去重必须 `update(已有)` 再 `remove(新)`。
2. **去重未触发**：hash/尾斜杠/开关/内部页边界。
3. **去重与分组竞态**：被关的新标签不应再进组；`closingTabIds` / suppress 关闭记录。
4. **模型全失败时仍可启发式分组**，且 UI 有提示。

### 4.2 边界值、等价类和状态迁移

**URL 等价类**

| 类 | 例 | 期望 |
|----|----|------|
| 普通 https 相同 | 两次打开同一文章 URL | 去重 |
| 仅 hash 不同，ignoreHash=false | `/a#x` vs `/a#y` | **不去重** |
| 仅 hash 不同，ignoreHash=true | 同上 | 去重 |
| 尾斜杠不同 | `/a` vs `/a/` | 不去重（精确 href） |
| 内部页 | `chrome://extensions` | 跳过 |
| 跨窗口同 URL | 两窗口各一 | **去重并跳到已有窗口+标签** |

**开关状态**

- `exactDedupeEnabled=false`：重复打开保留两标签
- `autoSemanticGroupEnabled=false`：complete 后不自动进组；立即分组仍可用

### 4.3 决策表和错误猜测

| Nano | Custom 配置 | 期望 source |
|------|-------------|-------------|
| available | 任意 | 优先 nano |
| downloadable/missing | 有效 | custom |
| unavailable | 空 | heuristic |
| 任意 | Key 错误 | heuristic（不崩） |

错误猜测：SPA 延迟出正文 → debounce 后仍空 → 标题启发式；CSP 页 → executeScript 回退。

## 5. 测试命令和数据

- 安装：Load unpacked → 仓库根
- 数据页建议：
  - 静态文章两篇不同域名近义主题（分组）
  - 固定 URL `https://example.com/` 用于去重
  - `chrome://version` 用于跳过
- 自动化：当前无；批准后可考虑 Playwright + 持久 Chrome 用户目录，或最小 node 单测纯函数（`normalizeUrl`）

### P0 用例明细（去重）

| ID | 步骤 | 期望 |
|----|------|------|
| TC-DEDUP-01 | 开启去重；打开 URL A；再开 A | 仅 1 个 A；焦点在旧标签 |
| TC-DEDUP-02 | 关去重；重复开 A | 2 个 A |
| TC-DEDUP-03 | ignoreHash 关；开 `/p#1` 再开 `/p#2` | 2 标签 |
| TC-DEDUP-04 | ignoreHash 开；同上 | 1 标签 |
| TC-DEDUP-05 | 打开 chrome:// 页 | 不去重、不注入崩溃 |
| TC-DEDUP-06 | 窗口1 有 A；窗口2 开 A | 聚焦窗口1 的 A，关闭窗口2 新标签 |

### P0 用例明细（分组/模型/UI）

| ID | 步骤 | 期望 |
|----|------|------|
| TC-GROUP-01 | 立即分组当前窗口 | 出现组标题；结果文案含数量 |
| TC-GROUP-02 | 自动分组开；导航完成 | 标签进入某组 |
| TC-MODEL-01 | 查看 Nano badge | 非永久「检测中」 |
| TC-MODEL-02 | downloadable 时点下载 | 进度/状态变化或明确错误 |
| TC-MODEL-03 | 清自定义 + Nano 不可用 | 启发式；页脚提示 |
| TC-UI-01 | 切换三项开关 | 刷新 popup 状态保持 |
| TC-EXT-01 | 对长文页抽取 | 文本非 HTML；长度受限 |

## 6. 测试报告要求

批准执行后新建 `05-testing/test-report.md`，包含：Chrome 版本、扩展版本、OS、用例表、通过/失败、截图路径、残余风险。同步更新 `evidence-manifest.md`。

## 7. 联调门禁

- 进程和端口拓扑：仅浏览器进程；无本地 server
- 环境变量和环境隔离：可用独立 Chrome profile
- 数据库、迁移：无
- service-to-service：无
- 第三方 API 最小验证：自定义模型可用一次成功 chat 或故意失败看降级
- 失败归因格式：`[dedupe|extract|classify|tabGroups|popup|chrome-api] message`

## 8. 客户端专项联调（条件启用）

- 是否启用客户端专项门禁：**是**（扩展即客户端）
- 启用原因：无后端，验收必须在真实 Chrome 完成
- 客户端类型：Chrome Extension MV3
- 运行形态：Load unpacked
- API 环境：可选用户端点
- 关键用户路径：重复开链；立即分组；配置 Nano/自定义
- 验证工具和命令：手工 + 未来自动化
- 设备、浏览器、版本或构建号：记录于 test-report
- 证据路径：`05-testing/`、`04-engineering/evidence-manifest.md`

## 9. 未解决问题

- 是否引入最小单测（url-utils / sanitizeLabel）作为 CI
- Nano 在 CI 环境通常不可用——CI 只跑纯函数，端侧放手工/夜间机
