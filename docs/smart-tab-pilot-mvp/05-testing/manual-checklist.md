# MVP 手工验收清单（编码轮）

- 扩展版本：`1.2.0`（manifest）
- 分支：`feature/smart-tab-pilot-mvp`
- 纯函数自检：`npm test`（`normalizeUrl` / 域名标签拒绝 / 同域不同主题启发式）

## TC-DEDUP（P0）

| ID | 步骤 | 期望 | 结果 |
|----|------|------|------|
| TC-DEDUP-01 | 开去重；打开 `https://example.com/`；再开同一 URL | 仅 1 标签；焦点在旧标签 | ☐ |
| TC-DEDUP-02 | 关去重；重复开 | 2 标签 | ☐ |
| TC-DEDUP-03 | ignoreHash 关；`/p#1` 与 `/p#2` | 2 标签 | ☐ |
| TC-DEDUP-04 | ignoreHash 开；同上 | 1 标签 | ☐ |
| TC-DEDUP-05 | `chrome://version` | 不去重、不崩 | ☐ |
| TC-DEDUP-06 | 窗口1 有 A；窗口2 开 A | 窗口2 保留（同窗口策略） | ☐ |

## TC-GROUP / 同域不同主题（P0 硬约束）

| ID | 步骤 | 期望 | 结果 |
|----|------|------|------|
| TC-GROUP-DOM-01 | 同域打开两篇不同主题文章（如 github 两个无关 README/Issue）→「立即分组」 | **两个不同组名**；组名不是 `GitHub` / hostname | ☐ |
| TC-GROUP-01 | 立即分组当前窗口 | 出现主题组；结果文案含数量与来源 | ☐ |
| TC-GROUP-02 | 自动分组开；导航完成 | 进组 | ☐ |
| TC-MODEL-03 | 无 Nano + 无自定义 | 启发式；页脚提示；仍不按域名并组 | ☐ |

## TC-UI

| ID | 步骤 | 期望 | 结果 |
|----|------|------|------|
| TC-UI-01 | 开关去重/ignoreHash/自动分组 | 刷新 popup 保持 | ☐ |
| TC-UI-SEARCH | 默认不显示快速搜索；勾选「启用快速搜索」后出现 | 默认关；可选开 | ☐ |

## 自动化证据

```text
npm test
```

（本文件记录手工格；自动化通过情况写入 `test-report.md` 当 Chrome 手工跑完后。）
