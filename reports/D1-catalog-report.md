# D1 — Catalog 定稿核对报告

日期：2026-10-01 ｜ 核对基线：EAC 仓库 tag **v5.3.6** 与 HEAD（v6.0.0-beta.1 重构期，浅克隆默认分支）、分支 **aio-v1**、本机 AIO 6.9.3 离线发行版（`D:\DSHEAC AIO`）、npm registry 实时查询。

## 0. 最终决定（TL;DR）

| 项 | 背景任务清单 | 实测 | 最终采用 |
| --- | --- | --- | --- |
| EAC 包在役数量 | 41 项 | 47（v5.3.6 注册表 = 目录数）+ 1（think-zh GitHub 独立分发） | **48 项** |
| catalog/eac.json | 41 项 | — | 48 项（40 独有 + 8 共享标记 `["eac","aio"]`） |
| catalog/aio.json | 9 插件 + 8 第三方 | 9 插件 + 10 第三方 | 19 条 |
| catalog/skins.json | 10 皮肤 | 10 皮肤（9 npm + 1 eac-tag） | 10 条 |
| catalog/retired.json | 8 退役 + AIO 移除 | EAC 侧 8 退役 + 1 取代记录；AIO v1.2.0 移除 6 条 | 15 条 |

## 1. 数量矛盾："41 项在役"不成立

任务背景称"EAC 主线 49 项清单"且要求 catalog 写 41 项在役（隐含 49−8 退役=41 的算术）。实测链路：

- v5.3.6 `dsh-desktop/lib/desktop/companion-sync.ts` 的 `COMPANION_PLUGINS` = **47 条**；`assets/plugins/` = **47 个目录**，与注册表一一对应（每目录均有 package.json）。
- HEAD 同文件 `COMPANION_PLUGINS` 仍为 **47 条**（背景所称"49 条"不成立）。
- 背景 49 项清单中：`dsh-stt`、`dsh-think-zh-expand-eac` 两项不在 v5.3.6（也不在 HEAD 注册表）。47 + think-zh（GitHub 独立分发实测可得）= **48 在役**。
- 8 项"退役排除"全部不在 47 目录内，与在役集无交集，故任何 49/47−8 的算术都不产生 41。判定：**41 为误算，以 v5.3.6 实测为准修定为 48**。

## 2. 单项修正（以 v5.3.6 实测为准）

### 2.1 dsh-stt：在役（默认禁用）→ 退役

- v5.3.6 注册表/目录均无 dsh-stt；HEAD 的 `RETIRED_BUILTIN_PLUGINS` 明确在列，注释：**5.3.0 按用户要求移除内置语音转文字插件（本地 sherpa-onnx ASR 模型 ~1.1G 不再随包分发/安装）**，`~/.dsh/models/dsh-stt/` 模型缓存属用户数据不清除。
- 处置：从 eac.json 移除，归入 retired.json（含出处）。

### 2.2 dsh-think-zh-expand-eac：从未进 EAC 仓库

- v5.3.6 与 HEAD 的注册表、全部 tag（v2.0.3…v6.0.0-beta.1）均无此目录/条目；aio-v1 全树 grep 无引用。
- 独立分发仓库 `jing-hy/dsh-think-zh-expand-eac` 实测可达（git ls-remote OK），main HEAD package.json **version 1.0.1**（背景写 1.0.0），MIT，预编译 lib/ 完整、`dsh.bundle.patch` 结构规范。
- 处置：保留在 eac.json，`source: github`，spec `git+https://github.com/jing-hy/dsh-think-zh-expand-eac.git`，版本锁定 1.0.1。

### 2.3 版本号修正（背景清单 → v5.3.6 实测）

| 包 | 背景清单 | v5.3.6 实测 | 说明 |
| --- | --- | --- | --- |
| dsh-file-drop-eac | 0.1.2 | **0.1.0** | 独立 GitHub 仓库也只有 v0.1.0 tag，与随包一致 |
| dsh-better-sidebar | 0.15.3-eac.2 | **0.15.3-eac.1** | npm 无该 EAC 预发布（上游 latest 0.24.1）→ eac-tag |
| dsh-unified-market | 0.4.0 | **0.3.1** | npm 存在 0.3.1 → source=npm |
| picturereader | 3.3.3 | **3.3.1** | npm 存在 3.3.1 → source=npm（不追 3.3.3） |
| dsh-think-zh-expand-eac | 1.0.0 | **1.0.1** | 见 2.2 |
| dsh-status-rotator（AIO） | （背景未定版） | **0.9.1**（seed ^0.9.1） | npm 精确版存在 |

### 2.4 npm 锁定版本可用性核查（source 判定依据）

对全部 EAC/AIO 锁定版本逐一查询 registry（`registry.npmjs.org`）：

- **npm 有精确锁定版（11 项，source=npm）**：picturereader@3.3.1、computer-user@0.3.6、dsh-dafeiyu@0.1.0-alpha.6、meow-smooth@0.5.0、@vlln/dsh-navbar@0.3.0、dsh-pet@0.1.3、dsh-session-manager@0.1.0、dsh-soul-md@0.2.8、dsh-unified-market@0.3.1、dsh-web-mobile-fix@1.0.1、dsh-whale-widget@0.2.10。
- **同名包存在但锁定版本不存在（易踩坑，source=eac-tag）**：`@deepseek-ai/dsh-plugin-manager`（npm 有包，latest 0.1.6-alpha.2，**无 0.1.0**）、`dsh-compact`（npm 仅 0.1.0，EAC 随包 **1.0.0** 非同一版本线）。
- **npm 完全无包（404）**：@deepseek-ai/dsh-balance、dsh-file-changes、dsh-client-file-changes、dsh-terminal、dsh-float-window、dsh-conversation-tweaks、dsh-prompt-custom、dsh-openclaw-bridge、dsh-skin-switch、dsh-easy-setup、dsh-file-drop-eac、dsh-settings-scroll-fix、dsh-viewport-lock、dsh-feature-toggles、dsh-font-custom、dsh-dock-settings、dsh-pet-settings、dsh-phone、dsh-plugin-shield、dsh-plugin-wizard、dsh-eac-core-bridge、dsh-eac-locale-compat、dsh-change-review、dsh-composer-dynamic-island、dsh-message-rewind、dsh-raw-html、dsh-settings-groups、@dsh-external/dsh-side-session、dsh-image-paste、dsh-webui-prompt-optimizer、dsh-offpeak、dsh-undo-savepoint、@nanmicoder/dsh-agent-teams@0.1.13-eac.3（包在，无 eac.3 预发布）、dsh-better-sidebar@0.15.3-eac.1（同前）。
- **offpeak 特别说明**：v5.3.6 随包副本 package.json 版本号为 **9.9.9 占位**；npm 404；上游 `christophersmith2737-commits/OffPeak` 仓库可达。按"npm → eac-tag 优先于 github"规则采用 eac-tag，保留 9.9.9 占位版本号（notes 已说明）。

### 2.5 SOURCES.json 不存在

背景称 `dsh-desktop/assets/SOURCES.json` 为来源台账；实测 v5.3.6 与 HEAD 的 assets 树中均无此文件（sparse-checkout 明确包含该路径仍缺席，`git ls-tree` 复核无）。各插件的出处理由 registry 注释、package.json `repository` 字段与背景清单三方交叉重建，已写入 catalog `upstream`/`notes`。

## 3. 退役清单修正

- HEAD `RETIRED_BUILTIN_PLUGINS` 实际 8 条：auto-compact、plugin-marketplace、dsh-market-plugin(@sanqi-normal/dsh-webui-market-plugin)、zat-market(zat-dsh-engine)、third-party-thinking、tool-vision、settings-nav-custom、**dsh-stt**。
- 背景清单把 **dsh-file-drop(旧版)** 列为第 8 条退役项 —— 它不在 RETIRED 注册表中（v5.3.6 注册表注释仅说明"被 file-drop-eac 取代"），而 dsh-stt 才是注册表内第 8 条。retired.json 两条都收录（file-drop 标注"取代关系"证据），共 9 条 EAC 侧记录。
- AIO v1.2.0 移除项（aio-v1 CHANGELOG 2026-09-09 原文实锤）：**dsh-market、dsh-offpeak、dsh-plugin-marketplace、dsh-skin-switch、dsh-webui-market、dsh-usage-skill**（6 条 + "九个未使用皮肤"）。其中 dsh-skin-switch 现分支已恢复为在役（aio.json 收录，retired 仅作历史记录）。

## 4. AIO 清单修正

- **第三方运行时包：背景列 8 项，seed 实际 10 项**（`distribution/profile-seed/profiles/web-desktop/package.json`）：
  1. `@dsh-external/dsh-webui@0.5.1`（npm 404 → 提取自本机 AIO 6.9.3 离线包 seed node_modules）
  2. `@dsh-external/dsh-visualize`（git 包，背景遗漏）—— 上游已改名 **`@nagi-ovo/dsh-visualize`**（HEAD 0.1.4；本机旧副本 @dsh-external 0.1.2）。catalog 采用新名 + GitHub HEAD 0.1.4，Host 写 bundles/patch 行须用新名。
  3. `@ha-na-bi/dsh-client-ui-custom@0.1.0-rc.6`（npm 仅 rc.5 → 本机离线包提取）
  4. `@local/dsh-webui-statem-bridge@1.2.2`（私有构建，背景遗漏；package.json private/UNLICENSED，公开仓库无源码（THIRD_PARTY_NOTICES 指向私有 source/local-plugins），本机离线包提取，随包原样再分发、不可单独发布）
  5. `dsh-drag-and-drop`（git，HEAD 0.1.6 与本机一致）
  6. `dsh-find-plugin@0.3.7`、7. `dsh-meme@0.1.39`、8. `dsh-plugin-wallpaper-engine@0.6.7`、9. `dsh-status-rotator@0.9.1`（均 npm 精确版存在）、10. `dsh-whale-widget@0.2.10`（共享）。
- seed 同时 pin 的 `@deepseek-ai/dsh-client-ui-primitives` 等 0.1.5-rc.2 属 AIO 自带内核闭包，**不进整合包**（宿主 0.2.0-rc.2 自带）。
- AIO 9 插件实测：aio-ui-compat 1.0.0、auto-compact 0.1.0（AIO 独有 2 个）+ balance 0.1.0、better-sidebar 0.12.2、composer-dynamic-island 2.1.0、plugin-manager 0.1.0、plugin-shield 0.1.0、skin-switch 0.1.0、undo-savepoint 0.3.3-1。共享版本冲突 2 项按约定**以 EAC 为准**：better-sidebar（0.12.2→0.15.3-eac.1）、undo-savepoint（0.3.3-1→0.3.4）。
- peer 依赖耦合链实测：`@dsh-external/dsh-webui` 与 `@ha-na-bi/dsh-client-ui-custom` 的 peerDependencies 精确依赖 `dsh-aio-ui-compat@1.0.0` → 三者必须同装（保留精确 pin，未放宽，因 aio-ui-compat 就是 1.0.0）。

## 5. 皮肤实测

- 目录名 ≠ npm 包名：9 款为 `@linxin666/dsh-client-ui-skin-*@0.1.11`（BSD-3-Clause，npm 精确版存在；latest 已 0.2.0，锁定 0.1.11 不追新），出自 zhu1090093659/dsh-web-ui。
- `maid-atelier` 为 `@dsh-external/dsh-client-ui-skin-maid-atelier@0.0.1`，**CC-BY-NC-SA-4.0（非商业）**，npm 404 → aio-v1 assets/skins 提取（LICENSE/NOTICE 已随包，重打包 files 强制补入验证通过），peer `@deepseek-ai/cordis ^4.0.1` 已放宽。

## 6. 其他记录

- EAC 注册表行 id 与目录短 id 不一致映射（mobile-fix、dsh-raw-html、dsh-navbar、dsh-session-manager、dsh-pet、dsh-phone、dsh-feature-toggles、dsh-whale-widget、agent-teams、dsh-undo、dsh-dafeiyu、dsh-pet-settings、unified-market、dsh-webui-prompt-optimizer 等）已写入各条 notes，供 Host 写 patch 行对齐 EAC 行为。
- 带 config 默认值的行：soul-md `{"path":"soul.md"}`、meow-smooth `{"enabled":true}`、dsh-pet `{"size":260,"position":"bottom-right"}`（缺 config 块曾致插件树崩溃，EAC 注释明示）。
- 默认禁用实测（v5.3.6 注册表 `disabled: true`）：dsh-pet、dsh-whale-widget、dsh-image-paste（背景一致；stt 已退役移出）。

## 7. 遗留问题

1. offpeak 的 dist 文件名带占位版本号（dsh-offpeak-9.9.9.tgz）——保留 EAC 原状，如上游发版可后续切换 source=github。
2. `@local/dsh-webui-statem-bridge` 为 AIO 私有构建，整合包只能随包整体分发；对外单独分发需 AIO 方授权。
3. visualize 上游改名（@dsh-external→@nagi-ovo）导致与 AIO seed 名不一致，Host 生成 AIO profile 的 bundles 列表时须用新名；升级 AIO 官方 seed 时注意回查。
4. 背景清单与仓库实况仍有 2 处无证据残留：官方配套中 dsh-stt 的"0.3.0 随包版本"无从验证（任何 tag 均无资产）；"COMPANION_PLUGINS 49 条"口径未找到（两代均 47）。
