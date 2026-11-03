# Smart Tab Pilot 竞品与开源调研

## 0. 版本历史

| 版本 | 日期 | 变更内容 | 变更原因 | 影响 |
|------|------|----------|----------|------|
| v0.1 | 2026-11-03 | 初始调研：TabAutopilot、Takt、page-agent 抽取 | OPC Skills 编码前开源/竞品门禁；支撑 MVP 差异化 | 冻结「正文语义分组 + 精确去重」与「不 vendor page-agent」 |

## 1. 当前结论

- **可复用方向**：Chrome Prompt API（Gemini Nano）端侧分类；`chrome.tabGroups`；精确 URL 去重跳转；文本 DOM / 脱水抽取以降本。
- **不可复用 / 不采用**：整套 Tab 工作区/休眠/Snooze 产品面；付费分层；vendor `alibaba/page-agent` 全栈 Agent。
- **本产品差异化（MVP）**：
  1. **首要成功标准**：精确 URL 去重跳转（激活已有标签并关闭新标签），而非「发现重复后一键关闭」。
  2. **按页面正文语义分组**（非按域名/固定分类表）。
  3. **模型阶梯**：Nano（含 downloadable 提示）→ 用户自备 OpenAI 兼容 → 启发式。
  4. **开源 MIT**；仅借鉴 page-agent 文本 DOM 理念，自研轻量抽取。
- **快速搜索**：竞品多有标签搜索；本仓库已有实现，但产品上定为 **P1 / 后续版本**，MVP 文档不扩展范围。

## 2. 竞品：TabAutopilot

| 维度 | 观察 |
|------|------|
| 定位 | AI 智能标签管理：自动分组、工作区、Snooze、休眠、重复检测 |
| AI | 优先本机 Gemini Nano；无 Nano 时本地规则引擎；强调不上云 |
| 分组 | 按主题或域名；可学习用户改组；偏「全能管家」 |
| 去重 | 实时检测重复 URL；角标计数；可一键/自动关闭；可忽略追踪参数 |
| 其它 | Session/Workspace、休眠、站点数据清理、可选 Google Drive 备份 |
| 许可 | 商店免费扩展；源码可见于 rocke3/TabAutopilot（非本项目依赖） |
| 对本 MVP 启发 | Nano + 本地回退路径正确；去重是刚需。但 TabAutopilot 范围过大，且去重偏「清理」而非「打开即跳转」的主成功路径。 |
| 本产品取舍 | **不做** Workspace/Snooze/休眠/Drive；**强化**「新开同 URL → 立刻跳到已有标签并关新标签」。 |

参考：

- Chrome Web Store：`TabAutopilot – AI Smart Tab Manager`
- GitHub：https://github.com/rocke3/TabAutopilot

## 3. 竞品：Takt（AI Tab Organizer）

| 维度 | 观察 |
|------|------|
| 定位 | 规则分组 + 固定分类 + Smart Group with AI；重复打开防护；搜索/休眠（Premium） |
| AI | Prompt API：标题 + 至多约 500 字符正文；无模型时语义相似度回退；免费档 AI 分组数量上限（如 5） |
| 分组 | 规则（URL）、20 类固定 Category、AI 动态标签；AI 模式多为手动触发批量分组 |
| 去重 | 默认开启：打开已存在链接则关新开、切到原标签；多种 URL 匹配模式（exact / 忽略 hash / query 等） |
| 搜索 | 打开中标签列表与搜索；Quick Switch（Premium） |
| 对本 MVP 启发 | 「重复打开即跳转」与本产品 P0 高度对齐；正文片段进 Prompt API 证明「非仅域名」可行。 |
| 本产品取舍 | MVP **固定精确匹配（默认含 hash）**，可选忽略 hash；**不做**规则引擎/固定 20 类/付费档。语义分组进 MVP，但模型阶梯含 **用户自备 OpenAI 兼容**（Takt 偏纯端侧）。抽取目标约 **4000 字符**主文，重语义主区域而非短摘要。 |

参考：

- https://taktabs.com/ / Smart Group with AI 文档
- Chrome Web Store：`Takt — Auto Tab Group Manager`

## 4. 开源抽取：alibaba/page-agent

| 维度 | 观察 |
|------|------|
| 定位 | 页内 JS Agent：文本化 DOM 操作，无需截图/多模态 |
| 关键机制 | Live DOM → FlatDomTree → 脱水/简化文本供 LLM；语义标签可保留；按元素索引操作 |
| 许可与形态 | 开源；完整 Agent + PageController 栈体积与职责远超「标签主题分类」 |
| 对本项目启发 | **用文本 DOM 快照代替截图**，让廉价文本模型即可理解页面主题，降低成本与权限面。 |
| 明确边界 | **禁止 vendor 整套 page-agent**。仅借鉴：语义主区域（`article`/`main`）、标题层级、剥离 nav/footer 噪音、硬字符上限。自研 `content/extract.js` + `grouping.js` 注入回退。 |

参考：https://github.com/alibaba/page-agent

## 5. 对比矩阵（相对 Smart Tab Pilot MVP）

| 能力 | TabAutopilot | Takt | Smart Tab Pilot MVP |
|------|--------------|------|---------------------|
| 精确 URL 打开即跳转 | 部分（偏检测/关闭） | 强（默认防护） | **P0 首要成功标准** |
| 按正文语义分组 | 有（主题/域名） | 有（AI + 短摘录） | **P0，正文快照 ~4k** |
| 按域名/规则分组 | 有 | 有 | 不做（MVP） |
| Nano 端侧 | 有 | 有 | 有 + downloadable 引导 |
| 用户自备 OpenAI 兼容 | 未见主推 | 未见主推 | **有** |
| 启发式回退 | 本地规则 | 相似度 | 关键词启发式 |
| 快速搜索开/关标签 | 弱/其它形态 | 有（打开中） | **代码已有，产品 P1** |
| Workspace/Snooze/休眠 | 有 | 部分/Premium | Out of scope |
| 开源 MIT 可 Load unpacked | 部分开源 | 闭源产品 | **是** |

## 6. 选型决策（冻结）

1. 去重：同窗口精确 URL（默认含 hash）→ 激活已有 → 关闭新标签；跳过内部页。
2. 分组：页面正文文本快照 → 分类标签 → `chrome.tabGroups`；非域名。
3. 模型：LanguageModel/Nano → downloadable 用户手势下载 → OpenAI 兼容 → heuristic。
4. 抽取：自研轻量文本 DOM；灵感自 page-agent，不引入其依赖。
5. 搜索：后续版本；现有 `search.js` / popup 搜索区标记为 **ahead-of-scope**，审核通过前不扩大产品承诺。

## 7. 未解决问题

- Nano 在目标 Chrome 版本/硬件上的实际可用率（需真机抽样）。
- 自定义 API Key 存 `chrome.storage.sync` 的安全提示是否需独立 options 页（MVP 弹窗即可）。
- Chrome Web Store 上架时隐私披露文案（与「可选出站自定义模型」相关）。
