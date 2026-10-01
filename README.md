# dsh-plugin-suite — EAC/AIO 插件整合包

为 **DeepSeek Harness 官方桌面端（v0.2.0-rc.2）** 打造的一体化插件整合包：安装这一个插件，
即可在官方设置页里一键安装 / 更新 / 管理 **EAC（揽尽万象）** 与 **DSHEAC AIO** 的全量在役插件。

> 一个包 = 41 个 EAC 在役插件 + 15 个 AIO 插件与运行时组件 + 10 款可选皮肤，全程离线可装（tarball 随包内置）。

## 功能

- **整合包安装器**：官方桌面端 设置 → 内置插件 → 「整合包」tab
  - 三张套餐卡：EAC 全量包 / AIO 精选包 / 皮肤（可选，默认不启用）
  - 插件清单：状态徽章（已启用 / 已装未启用 / 可更新 / 未安装）、来源与风险分级
  - 一键安装 / 勾选安装 / 原地更新 / 移除，实时进度与 SSE 日志
- **安全机制**：安装前自动快照 profile（`~/.dsh/plugin-suite/snapshots/`），失败自动回滚；
  pnpm 构建脚本拦截自动批准；对不兼容内核版本的插件按需授予精确版本豁免
- **双语**：中文 / English 界面，跟随壳语言
- **退役插件已排除**：auto-compact(main)、plugin-marketplace、webui-market、zat-dsh-engine、
  third-party-thinking、tool-vision、settings-nav-custom、旧版 file-drop

## 安装（官方桌面端）

1. 打开 DeepSeek Harness 桌面端 → 侧栏「插件」→「添加插件」
2. 输入发布包地址（GitHub Release 中的 `dsh-plugin-suite-x.y.z.tgz` 链接，或本地文件绝对路径）
3. 点击安装 → 立即启用
4. 设置 → 内置插件 → 「整合包」→ 选择套餐 → 一键安装

## 仓库结构

```
catalog/           插件目录定稿（eac / aio / skins / retired）
scripts/repack/    重打包管线：提取 → peer 适配 0.2.0-rc.2 → npm pack → SHA256
suite/             整合包插件本体（宿主半 index.js + 浏览器半 client.js + 目录数据）
suite/dev/         本地 UI 预览环境（脱离内核迭代）
docs/              分发映射与机制文档
reports/           每日验证报告与真机测试矩阵
dist/              重打包产物（发布到 Release）
```

## 许可

本整合包 MIT。随包分发的第三方插件保留其原有许可证与署名（均为 MIT，个别素材有附加条款，
见 `catalog/*.json` 的 license/notes 字段）。

## 相关链接

- 官方内核：https://github.com/deepseek-ai/deepseek-harness
- EAC 插件来源：https://github.com/DSH-EAC/DSH-Desktop-EAC
