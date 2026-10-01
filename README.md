# dsh-plugin-suite — EAC/AIO 插件整合包（完全体）

为 **DeepSeek Harness 官方桌面端（v0.2.0-rc.2）** 打造的一体化插件整合包：安装这一个插件，
即可在官方设置页里一键安装 / 更新 / 管理 **EAC（揽尽万象）** 与 **DSHEAC AIO** 的全量在役插件，
以及 **16 款皮肤**（10 款内置 + 6 款社区皮肤）与全部皮肤的 AI Prompt 创作包。

> 一个包 = EAC 48 项 + AIO 19 项 + 皮肤 16 款，**离线可装**（tarball 随包内置），
> **联网即自动更新**（GitHub Release 渠道 + sha256 校验）。

## 功能

- **整合包安装器**：官方桌面端 设置 → 内置插件 → 「整合包」tab（v0.2.0 全新四区界面）
  - **概览**：三张套餐卡（EAC 全量包 / AIO 精选包 / 皮肤馆）+ 进度环 + 一键安装
  - **皮肤馆**：16 款皮肤图鉴（明暗预览图离线可见）+ AI Prompt 查看与一键复制
    （拿着 prompt 就能让 AI 复刻 / 二创同款皮肤）
  - **插件管理**：按包分组清单、风险分层徽章（core/visual/heavy）、单项更新、版本对照
  - **更新中心**：在线渠道状态、自动更新开关、可更新清单、changelog、镜像前缀设置
- **在线渠道**（v0.2.0 新增）：渠道索引走 raw.githubusercontent + jsDelivr 双源，
  资产下载自 GitHub Release（可配置镜像前缀）；下载流式进度、sha256 校验、失败自动重试
- **离线优先**：无网络时一切照旧使用随包 tarball；安装内置版后联网即自动更新到渠道最新版
- **安全机制**：安装前自动快照 profile（`~/.dsh/plugin-suite/snapshots/`），失败自动回滚；
  pnpm 构建脚本拦截自动批准；对不兼容内核版本的插件按需授予精确版本豁免；
  更新不改变用户已选择的启用/禁用状态
- **双语**：中文 / English 界面，跟随壳语言

## 安装（官方桌面端）

1. 打开 DeepSeek Harness 桌面端 → 侧栏「插件」→「添加插件」
2. 输入发布包地址（GitHub Release 中的 `dsh-plugin-suite-x.y.z.tgz` 链接，或本地文件绝对路径）
3. 点击安装 → 立即启用
4. 设置 → 内置插件 → 「整合包」→ 选择套餐 → 一键安装
5. （可选）更新中心 → 打开自动更新，联网后自动跟进渠道最新版本

## 皮肤来源与致谢

- 10 款内置皮肤出自 EAC / AIO 官方皮肤库（BSD-3-Clause / CC-BY-NC-SA-4.0）
- 6 款社区皮肤：鲸鱼娘系列（@smalltailqwq）、滑动变阻器（kingOfSoySauce）、
  鲸鱼娘昼夜工坊（GGBond2424648901）、终末地（ymh0000123）
- 皮肤 AI Prompt 包来自 [DSH-EAC/dsh-skin-prompt-packages](https://github.com/DSH-EAC/dsh-skin-prompt-packages)

## 仓库结构

```
catalog/           插件目录定稿（eac / aio / skins / community / retired）
scripts/repack/    重打包管线：提取 → peer 适配 0.2.0-rc.2 → npm pack → SHA256
scripts/           fetch-assets（预览图/prompt 抓取）· publish-channel（在线渠道发布）
suite/             整合包插件本体（宿主半 index.js + 浏览器半 client.js + 目录数据）
suite/dev/         本地 UI 预览环境（脱离内核迭代）
channel/           在线渠道索引（channel.json，随仓库分发）
docs/              分发映射、机制文档与 API 契约
reports/           每日验证报告与真机测试矩阵
dist/              重打包产物（发布到 Release）
```

## 许可

本整合包 MIT。随包分发的第三方插件保留其原有许可证与署名（个别素材有附加条款，
见 `catalog/*.json` 的 license/notes 字段；滑动变阻器皮肤为 NOASSERTION）。

## 相关链接

- 官方内核：https://github.com/deepseek-ai/deepseek-harness
- EAC 插件来源：https://github.com/DSH-EAC/DSH-Desktop-EAC
