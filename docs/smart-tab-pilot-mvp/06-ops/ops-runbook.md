# Smart Tab Pilot 运维手册

## 0. 版本历史

| 版本 | 日期 | 变更内容 | 变更原因 | 影响 |
|------|------|----------|----------|------|
| v0.1 | 2026-11-03 | Load unpacked 与后续商店预留 | 扩展无后端；简化发布形态 | awaiting-user-review |

## 1. 当前决策

- 当前运维目标：保证开发者与早期用户能 **稳定 Load unpacked**；记录常见故障；为未来 Chrome Web Store 预留清单
- 当前巡检方式：手工打开 popup 看 Nano 状态；抽查去重与立即分组
- 当前故障处理边界：单机扩展；无中心化服务可重启；问题归因到 Chrome 版本 / 权限 / 设置 / 出站 API

## 2. 环境和配置

- 本地：Chrome（建议较新稳定版）+ 开发者模式 + Load unpacked 指向含 `manifest.json` 的仓库根 `/workspace/smart-tab-pilot`（或用户本机拷贝路径）
- 预发：无云预发；可用「第二 Chrome 用户配置」加载同一目录模拟
- 生产：
  - **短期**：GitHub 源码 + Load unpacked / 打包 zip 分发
  - **后续**：Chrome Web Store（见 release-plan）
- 关键环境变量：无进程 env；用户在弹窗配置 `customBaseUrl` / `customApiKey` / `customModel`
- 数据库/schema：无
- 下游服务：可选用户 OpenAI 兼容端点；Chrome LanguageModel

## 3. 发布门禁

- 发布方案评审：见 `06-ops/release-plan.md`（扩展单系统矩阵）
- 关联系统矩阵：仅扩展本体；无主服务
- 代码保存：Git commit 可追溯
- 预发部署：Load unpacked 验收 = 预发等价
- 预发测试报告：`05-testing/test-report.md`（批准后）
- CR/PR：建议文档与代码分 PR；中文描述
- 生产部署：商店提交或 Release zip
- 线上 smoke：安装后 TC-DEDUP-01 + 立即分组
- 线上回归：同上 + 开关关闭行为
- 发布完成条件：P0 用例通过；版本号与 changelog 一致

## 4. 日常巡检

### 4.1 启动检查

1. `chrome://extensions` 中扩展启用、无报错卡
2. Service worker 可打开检查控制台
3. Popup 能打开，Nano 状态非永久转圈

### 4.2 健康检查

1. 去重开：重复开链应跳转
2. 立即分组：有结果文案
3. （若配置了自定义）故意错误 Key 应降级而非卡死

### 4.3 数据和对象存储检查

- `chrome.storage.sync`：设置项
- `chrome.storage.local`：最近关闭（P1 功能数据）；可清
- 无 OSS

## 5. 告警和故障处理

### 5.1 告警等级

| 级 | 含义 | 例 |
|----|------|----|
| P0 | 去重误杀或完全不工作 | 关错标签 |
| P1 | 分组全失败且无启发式 | 分类抛错未捕获 |
| P2 | Nano 不可用仅体验降级 | 提示用户下载或配模型 |

### 5.2 常见故障归因

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 去重无效 | 开关关；URL 不完全一致 | 查设置与 URL；跨窗口应跳到已有标签 |
| 分组不动 | 自动分组关；受限页；SW 错误 | 看 worker 日志；立即分组 |
| Nano 缺失 | 频道/硬件/旗标 | 下载按钮或自定义模型 |
| 自定义失败 | CORS/Key/URL 路径 | 确认 `.../v1` 与 Bearer |
| 搜索异常 | **非 MVP** | 记录；不阻断 MVP |

### 5.3 证据保留

- 扩展 service worker 日志（脱敏）
- Popup 截图
- Chrome 版本与扩展版本

## 6. 回滚方案

- Load unpacked：checkout 上一 commit 后点「重新加载」
- 商店：提交上一版本包 / 使用商店回滚能力（若有）
- 用户侧：关闭去重/分组开关或卸载
- 按 `release-plan.md` 单系统回滚即可（无依赖服务）

## 7. Load unpacked 操作摘要

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择含 `manifest.json` 的目录
4. 固定图标；改代码后点「重新加载」

## 8. Chrome Web Store（后续预留）

- 需要：开发者账号、隐私政策（说明 tabs 内容抽取、可选出站 API、storage 中的 Key）、商店截图、权限Justification
- 本 MVP **不**将商店上架作为退出条件
- 上架前另开评审更新 `release-plan.md`

## 9. 未解决问题

- 是否提供 GitHub Actions 打 zip Release
- 隐私政策终稿语言（中/英）
