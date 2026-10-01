# DSH 插件整合包 — 分发映射（DISTRIBUTION）

适用宿主：官方 DeepSeek Harness 桌面端 **v0.2.0-rc.2**（`DSH_HOME=~/.dsh`，目标 profile：`~/.dsh/profiles/desktop`）。
插件经 pnpm 装入 profile 的 `node_modules`（`dsh plugin --profile <p> add <spec>`，即 pnpm 薄封装；profile 约定 `nodeLinker: hoisted` + `autoInstallPeers: false`）。

## 1. 包结构与 spec 语义

| 字段 | 语义 |
| --- | --- |
| `source: npm` | npm registry 存在 EAC/AIO 锁定的精确版本。spec = `name@version`（精确锁定，不追新）。 |
| `source: eac-tag` | 从 EAC 仓库 tag v5.3.6（或 aio-v1 分支 / 本机 AIO 离线包）资产目录提取，重打包为本地 tgz。spec = `file:dist/<tgz>`。 |
| `source: github` | 仅 EAC 作者独立 GitHub 分发的插件。spec = `git+https://…`。 |
| `source: github-tgz` | （v0.2.0 社区皮肤）社区作者经 GitHub Release 分发的 npm-pack 形态 tgz。下载锁定 release 资产 URL 到 `.cache/community-tgz/` 后解包规范化重打包。spec = `file:dist/<tgz>`。 |
| `source: github-repo` | （v0.2.0 社区皮肤）npm 不可达（如已 unpublish）的插件，从 GitHub 仓库浅克隆重打包。spec = `file:dist/<tgz>`。 |
| `packs` | 条目归属包：`eac`（EAC 全量包）/ `aio`（AIO 包）/ `skins`（皮肤包）。共享条目（如 balance）在 eac.json 为版本主记录，aio.json 内为镜像条目，两处 version/spec 一致，重打包脚本按包名去重。 |

`file:dist/...` 相对路径**由整合包 Host 在安装前半解析为绝对路径**（catalog 保存包内相对路径，Host 拼接整合包根目录后传给 `dsh plugin add`）。tgz 文件名约定：npm 包名 `/` → `_`（如 `@deepseek-ai/dsh-balance` → `@deepseek-ai_dsh-balance-0.1.0.tgz`）。

### 重打包时的 package.json 规范化（scripts/repack/repack.mjs）

1. `peerDependencies["@deepseek-ai/dsh"]`（若有）统一设为 `>=0.1.0-rc.6`。
2. 其余 `@deepseek-ai/*` peer：精确 pin 与 `^`/`~` 范围放宽为 `>=<floor>`（monotone 放宽，floor 保留）。动机：AIO 第三方包大量精确 pin 内部件 `0.1.3-alpha.2`，在 0.2.0-rc.2 下必然不满足；官方声明 **prereleases participate in range matching**，`>=floor` 形态在 includePrerelease 语义下可被 0.2.0-rc.2 满足。
3. 非 `@deepseek-ai` 作用域 peer（react/react-dom/zod/cordis 等）不动。
4. 剥离生命周期脚本（prepack/prepare/postpack/prepublish*/preinstall/install/postinstall）：发布物不含构建源，且避免 pnpm pendingBuilds。
5. `files` 白名单强制补入许可证/署名文件（LICENSE、NOTICE、ASSET_LICENSE.md、THIRD_PARTY_NOTICES.md 等）与功能清单（cordis.patch.yml、dsh-plugin.json、skin.json、PROVENANCE.json）。
6. `engines.dsh` 不被官方强制，保留原值不动。

## 2. EAC 包分发映射（catalog/eac.json，48 项）

 tier=core 常规功能；tier=visual 注入 Web UI 外观；tier=heavy 重资源/外部集成（安全/性能敏感）。

| id | 包名@锁定版本 | 来源方式 | spec | tier | 默认 |
| --- | --- | --- | --- | --- | --- |
| balance | @deepseek-ai/dsh-balance@0.1.0 | eac-tag 重打包（与 AIO 共享） | file:dist/@deepseek-ai_dsh-balance-0.1.0.tgz | core | 开 |
| file-changes | @deepseek-ai/dsh-file-changes@0.1.0 | eac-tag 重打包 | file:dist/@deepseek-ai_dsh-file-changes-0.1.0.tgz | core | 开 |
| client-file-changes | @deepseek-ai/dsh-client-file-changes@0.1.0 | eac-tag 重打包 | file:dist/@deepseek-ai_dsh-client-file-changes-0.1.0.tgz | core | 开 |
| terminal | @deepseek-ai/dsh-terminal@0.1.0 | eac-tag 重打包 | file:dist/@deepseek-ai_dsh-terminal-0.1.0.tgz | core | 开 |
| plugin-manager | @deepseek-ai/dsh-plugin-manager@0.1.0 | eac-tag 重打包（与 AIO 共享） | file:dist/@deepseek-ai_dsh-plugin-manager-0.1.0.tgz | core | 开 |
| float-window | @deepseek-ai/dsh-float-window@0.1.0 | eac-tag 重打包 | file:dist/@deepseek-ai_dsh-float-window-0.1.0.tgz | visual | 开 |
| conversation-tweaks | @deepseek-ai/dsh-conversation-tweaks@0.1.0 | eac-tag 重打包 | file:dist/@deepseek-ai_dsh-conversation-tweaks-0.1.0.tgz | core | 开 |
| prompt-custom | @deepseek-ai/dsh-prompt-custom@0.1.0 | eac-tag 重打包 | file:dist/@deepseek-ai_dsh-prompt-custom-0.1.0.tgz | core | 开 |
| openclaw-bridge | @deepseek-ai/dsh-openclaw-bridge@0.7.0 | eac-tag 重打包 | file:dist/@deepseek-ai_dsh-openclaw-bridge-0.7.0.tgz | heavy | 开 |
| skin-switch | @deepseek-ai/dsh-skin-switch@0.1.0 | eac-tag 重打包（与 AIO 共享） | file:dist/@deepseek-ai_dsh-skin-switch-0.1.0.tgz | visual | 开 |
| easy-setup | @deepseek-ai/dsh-easy-setup@0.1.0 | eac-tag 重打包 | file:dist/@deepseek-ai_dsh-easy-setup-0.1.0.tgz | core | 开 |
| eac-locale-compat | dsh-eac-locale-compat@1.0.0 | eac-tag 重打包 | file:dist/dsh-eac-locale-compat-1.0.0.tgz | core | 开 |
| eac-core-bridge | dsh-eac-core-bridge@1.0.0 | eac-tag 重打包 | file:dist/dsh-eac-core-bridge-1.0.0.tgz | core | 开 |
| picturereader | picturereader@3.3.1 | npm 精确版 | picturereader@3.3.1 | core | 开 |
| computer-user | computer-user@0.3.6 | npm 精确版 | computer-user@0.3.6 | heavy | 开 |
| soul-md | dsh-soul-md@0.2.8 | npm 精确版 | dsh-soul-md@0.2.8 | core | 开 |
| web-mobile-fix | dsh-web-mobile-fix@1.0.1 | npm 精确版 | dsh-web-mobile-fix@1.0.1 | visual | 开 |
| viewport-lock | dsh-viewport-lock@1.0.1 | eac-tag 重打包 | file:dist/dsh-viewport-lock-1.0.1.tgz | visual | 开 |
| meow-smooth | meow-smooth@0.5.0 | npm 精确版 | meow-smooth@0.5.0 | visual | 开 |
| better-sidebar | dsh-better-sidebar@0.15.3-eac.1 | eac-tag 重打包（与 AIO 共享） | file:dist/dsh-better-sidebar-0.15.3-eac.1.tgz | visual | 开 |
| raw-html | dsh-raw-html@0.6.2 | eac-tag 重打包 | file:dist/dsh-raw-html-0.6.2.tgz | visual | 开 |
| message-rewind | dsh-message-rewind@0.1.0 | eac-tag 重打包 | file:dist/dsh-message-rewind-0.1.0.tgz | core | 开 |
| pet | dsh-pet@0.1.3 | npm 精确版 | dsh-pet@0.1.3 | visual | **关** |
| dock-settings | dsh-dock-settings@0.1.0 | eac-tag 重打包 | file:dist/dsh-dock-settings-0.1.0.tgz | core | 开 |
| font-custom | dsh-font-custom@0.1.0 | eac-tag 重打包 | file:dist/dsh-font-custom-0.1.0.tgz | visual | 开 |
| compact | dsh-compact@1.0.0 | eac-tag 重打包 | file:dist/dsh-compact-1.0.0.tgz | core | 开 |
| plugin-shield | dsh-plugin-shield@0.1.0 | eac-tag 重打包（与 AIO 共享） | file:dist/dsh-plugin-shield-0.1.0.tgz | core | 开 |
| change-review | dsh-change-review@0.1.0 | eac-tag 重打包 | file:dist/dsh-change-review-0.1.0.tgz | core | 开 |
| navbar | @vlln/dsh-navbar@0.3.0 | npm 精确版 | @vlln/dsh-navbar@0.3.0 | visual | 开 |
| session-manager | dsh-session-manager@0.1.0 | npm 精确版 | dsh-session-manager@0.1.0 | core | 开 |
| side-session | @dsh-external/dsh-side-session@0.2.8 | eac-tag 重打包 | file:dist/@dsh-external_dsh-side-session-0.2.8.tgz | visual | 开 |
| phone | dsh-phone@0.1.0 | eac-tag 重打包 | file:dist/dsh-phone-0.1.0.tgz | heavy | 开 |
| feature-toggles | dsh-feature-toggles@0.1.1 | eac-tag 重打包 | file:dist/dsh-feature-toggles-0.1.1.tgz | core | 开 |
| whale-widget | dsh-whale-widget@0.2.10 | npm 精确版（与 AIO 共享） | dsh-whale-widget@0.2.10 | visual | **关** |
| agent-teams | @nanmicoder/dsh-agent-teams@0.1.13-eac.3 | eac-tag 重打包 | file:dist/@nanmicoder_dsh-agent-teams-0.1.13-eac.3.tgz | heavy | 开 |
| composer-dynamic-island | dsh-composer-dynamic-island@2.1.0 | eac-tag 重打包（与 AIO 共享） | file:dist/dsh-composer-dynamic-island-2.1.0.tgz | visual | 开 |
| plugin-wizard | dsh-plugin-wizard@0.1.0 | eac-tag 重打包 | file:dist/dsh-plugin-wizard-0.1.0.tgz | core | 开 |
| unified-market | dsh-unified-market@0.3.1 | npm 精确版 | dsh-unified-market@0.3.1 | core | 开 |
| undo-savepoint | dsh-undo-savepoint@0.3.4 | eac-tag 重打包（与 AIO 共享） | file:dist/dsh-undo-savepoint-0.3.4.tgz | core | 开 |
| dafeiyu | dsh-dafeiyu@0.1.0-alpha.6 | npm 精确版 | dsh-dafeiyu@0.1.0-alpha.6 | visual | 开 |
| pet-settings | dsh-pet-settings@0.1.0 | eac-tag 重打包 | file:dist/dsh-pet-settings-0.1.0.tgz | visual | 开 |
| offpeak | dsh-offpeak@9.9.9 | eac-tag 重打包（占位版本号） | file:dist/dsh-offpeak-9.9.9.tgz | core | 开 |
| file-drop-eac | dsh-file-drop-eac@0.1.0 | eac-tag 重打包 | file:dist/dsh-file-drop-eac-0.1.0.tgz | core | 开 |
| settings-groups | dsh-settings-groups@0.1.0 | eac-tag 重打包 | file:dist/dsh-settings-groups-0.1.0.tgz | core | 开 |
| settings-scroll-fix | dsh-settings-scroll-fix@2.0.2 | eac-tag 重打包 | file:dist/dsh-settings-scroll-fix-2.0.2.tgz | visual | 开 |
| image-paste | dsh-image-paste@0.1.0 | eac-tag 重打包 | file:dist/dsh-image-paste-0.1.0.tgz | core | **关** |
| webui-prompt-optimizer | dsh-webui-prompt-optimizer@0.1.0 | eac-tag 重打包 | file:dist/dsh-webui-prompt-optimizer-0.1.0.tgz | core | 开 |
| think-zh-expand-eac | dsh-think-zh-expand-eac@1.0.1 | GitHub（jing-hy 独立分发） | git+https://github.com/jing-hy/dsh-think-zh-expand-eac.git | core | 开 |

### EAC 包风险分层说明

- **heavy（外部集成/重资源）**：openclaw-bridge（外部微信/OpenClaw 网关）、computer-user（键鼠自动化，需 picturereader 配对）、phone（LAN 反向代理，依赖 EAC 桌面壳 sidecar）、agent-teams（多智能体，token 消耗大）。
- **默认关闭**：pet、whale-widget、image-paste（尊重 EAC 注册表 `disabled: true`）。
- **EAC 桌面壳依赖**（独立 profile 下降级但无害）：float-window/plugin-wizard/plugin-shield（壳 IPC）、eac-core-bridge（Supervisor 回环端点）、phone（sidecar 桥）。
- **patch 行注意**：soul-md 需带 `config: {"path":"soul.md"}`；meow-smooth 带 `config: {"enabled":true}`；pet 带 `config: {"size":260,"position":"bottom-right"}`（缺 config 块曾拖垮插件树）。EAC 注册表行 id 与目录短 id 不同者以 catalog notes 标注。

## 3. AIO 包分发映射（catalog/aio.json，9 插件 + 10 第三方运行时）

权威依据：aio-v1 分支 `assets/plugins/`（9 目录）+ `distribution/profile-seed/profiles/web-desktop/package.json`（第三方运行时锁定）。seed 同时 pin 的 `@deepseek-ai/dsh-client-ui-*` 等 0.1.5-rc.2 内部件属 AIO 自带内核闭包，**不进整合包**（0.2.0-rc.2 宿主自带对应实现）。

| id | 包名@锁定版本 | 来源方式 | spec | tier | 备注 |
| --- | --- | --- | --- | --- | --- |
| aio-ui-compat | dsh-aio-ui-compat@1.0.0 | eac-tag（aio-v1 assets） | file:dist/dsh-aio-ui-compat-1.0.0.tgz | core | AIO 独有；webui 与 client-ui-custom 的 peer 精确依赖 1.0.0，三者同装 |
| auto-compact | dsh-auto-compact@0.1.0 | eac-tag（aio-v1 assets） | file:dist/dsh-auto-compact-0.1.0.tgz | core | AIO 独有保留（EAC main 线已退役） |
| balance | 同 EAC | 共享 | 同 EAC | core | 两包同 0.1.0 |
| better-sidebar | 同 EAC 0.15.3-eac.1 | 共享 | 同 EAC | visual | AIO 随包 0.12.2 旧；以 EAC 版为准（peer 集不同） |
| composer-dynamic-island | 同 EAC 2.1.0 | 共享 | 同 EAC | visual | 同版本 |
| plugin-manager | 同 EAC 0.1.0 | 共享 | 同 EAC | core | 同版本 |
| plugin-shield | 同 EAC 0.1.0 | 共享 | 同 EAC | core | 同版本 |
| skin-switch | 同 EAC 0.1.0 | 共享 | 同 EAC | visual | 同版本（AIO v1.2.0 曾移除、分支已恢复） |
| undo-savepoint | 同 EAC 0.3.4 | 共享 | 同 EAC | core | AIO 随包 0.3.3-1 旧；以 EAC 版为准 |
| webui | @dsh-external/dsh-webui@0.5.1 | eac-tag（本机 AIO 离线包 seed node_modules） | file:dist/@dsh-external_dsh-webui-0.5.1.tgz | heavy | npm 无任何版本；peer 大量 pin 0.1.3-alpha.2 已放宽 |
| visualize | @nagi-ovo/dsh-visualize@0.1.4 | GitHub | git+https://github.com/Nagi-ovo/dsh-visualize.git | visual | 上游已从 @dsh-external 改名 @nagi-ovo（seed 写旧名，Host 写 bundles 用新名） |
| client-ui-custom | @ha-na-bi/dsh-client-ui-custom@0.1.0-rc.6 | eac-tag（本机 AIO 离线包） | file:dist/@ha-na-bi_dsh-client-ui-custom-0.1.0-rc.6.tgz | visual | npm 仅 rc.5；peer 依赖 dsh-aio-ui-compat@1.0.0 |
| webui-statem-bridge | @local/dsh-webui-statem-bridge@1.2.2 | eac-tag（本机 AIO 离线包） | file:dist/@local_dsh-webui-statem-bridge-1.2.2.tgz | core | AIO 私有构建（private/UNLICENSED），分发风险最高，随包原样再分发、不可单独发布 |
| drag-and-drop | dsh-drag-and-drop@0.1.6 | GitHub | git+https://github.com/bill9109/dsh-drag-and-drop.git | core | seed 以 git 引用；HEAD 与本机副本同 0.1.6 |
| find-plugin | dsh-find-plugin@0.3.7 | npm 精确版 | dsh-find-plugin@0.3.7 | core | seed ^0.3.7 |
| meme | dsh-meme@0.1.39 | npm 精确版 | dsh-meme@0.1.39 | visual | seed ^0.1.39 |
| wallpaper-engine | dsh-plugin-wallpaper-engine@0.6.7 | npm 精确版 | dsh-plugin-wallpaper-engine@0.6.7 | visual | seed ^0.6.7 |
| status-rotator | dsh-status-rotator@0.9.1 | npm 精确版 | dsh-status-rotator@0.9.1 | visual | seed ^0.9.1（背景清单版本有误，以 seed 为准） |
| whale-widget | dsh-whale-widget@0.2.10 | npm 精确版 | dsh-whale-widget@0.2.10 | visual | 共享；EAC 默认关、AIO seed 列入 bundles |

## 4. 皮肤包分发映射（catalog/skins.json，9 项 + catalog/community.json，6 项）

皮肤是完整 dsh client 插件包（package.json + lib/ + skin.json + cordis.patch.yml），默认全部 **disabled**，由「设置 → 皮肤」或 skin-switch 切换。包名与目录名不同（内置 9 款为 `@linxin666/dsh-client-ui-skin-*`）。

### 4.1 内置皮肤（catalog/skins.json，9 项）

| id | 包名@锁定版本 | 来源 | 许可证 |
| --- | --- | --- | --- |
| blue-fantasy | @linxin666/dsh-client-ui-skin-blue-fantasy@0.1.11 | npm 精确版 | BSD-3-Clause |
| dragon-heir | @linxin666/dsh-client-ui-skin-dragon-heir@0.1.11 | npm 精确版 | BSD-3-Clause |
| miku | @linxin666/dsh-client-ui-skin-miku@0.1.11 | npm 精确版 | BSD-3-Clause |
| minecraft | @linxin666/dsh-client-ui-skin-minecraft@0.1.11 | npm 精确版 | BSD-3-Clause |
| qq98 | @linxin666/dsh-client-ui-skin-qq98@0.1.11 | npm 精确版 | BSD-3-Clause |
| ths | @linxin666/dsh-client-ui-skin-ths@0.1.11 | npm 精确版 | BSD-3-Clause |
| trading | @linxin666/dsh-client-ui-skin-trading@0.1.11 | npm 精确版 | BSD-3-Clause |
| whale-song | @linxin666/dsh-client-ui-skin-whale-song@0.1.11 | npm 精确版 | BSD-3-Clause |
| xp | @linxin666/dsh-client-ui-skin-xp@0.1.11 | npm 精确版 | BSD-3-Clause |

### 4.2 社区皮肤（catalog/community.json，6 项，v0.2.0 新增）

统一 `packs: ["skins"]`、`tier: "visual"`、默认 disabled；随包携带可生效的自引用 `dsh.bundle.patch`。npm 源 spec = `name@version`；github-tgz / github-repo 源 spec = `file:dist/<tgz>`。

| id | 包名@锁定版本 | 来源 | 许可证 |
| --- | --- | --- | --- |
| deep-whale-manager | @smalltailqwq/dsh-client-ui-skin-deep-whale-manager@0.1.6 | npm 精确版 | MIT |
| maid-atelier | @smalltailqwq/dsh-client-ui-skin-maid-atelier@0.1.7 | npm 精确版 | CC-BY-NC-SA-4.0（鲸鱼娘美术，非商业） |
| orca-link | @smalltailqwq/dsh-client-ui-skin-orca-link@0.1.7 | npm 精确版 | CC-BY-NC-SA-4.0（鲸鱼娘美术，非商业） |
| liang | dsh-client-liang-intensity-skin@0.1.7 | github-tgz（kingOfSoySauce/dsh-liang-skin release v0.1.7） | NOASSERTION（仓库未声明） |
| deep-whale-day-night | @dsh-external/dsh-client-ui-skin-deep-whale-day-night@0.1.12 | github-tgz（GGBond2424648901/deep-whale-day-night-theme release v0.1.12） | CC-BY-NC-SA-4.0（包内声明；GitHub 仓库级识别为 NOASSERTION） |
| endfield | dsh-theme-endfield@1.1.5 | github-repo（ymh0000123/dsh-theme-endfield，npm 已 unpublish） | MIT |

社区皮肤注意事项：

- **互斥**：client-ui 皮肤之间互斥；deep-whale-manager 是切换管理器，经其统一切换，不可与其他皮肤 standalone 版叠装。
- **dsh-web-all 环境**：已装 `@linxin666/dsh-web-all` 的环境应使用其皮肤中心适配版，不能叠装 standalone 版。
- **maid-atelier 新旧两版**：社区 @smalltailqwq 0.1.7 取代旧 @dsh-external 0.0.1（已移入退役台账，见 §6），两版勿同装。
- **包名 ≠ 仓库名**：deep-whale-day-night 的实际包名 `@dsh-external/dsh-client-ui-skin-deep-whale-day-night` 与仓库名 `deep-whale-day-night-theme` 不同，以 release tgz 内 package.json 为准。

## 5. 共享插件版本冲突说明

EAC 与 AIO 随包版本不一致的共享条目，**一律以 EAC 包为准**（整合包两包安装同一份 dist tgz）：

| 包 | EAC v5.3.6 | AIO(aio-v1) | 采用 |
| --- | --- | --- | --- |
| dsh-better-sidebar | 0.15.3-eac.1 | 0.12.2 | **EAC**（0.15.x peer 面向 0.2.0-rc.2 时代内核） |
| dsh-undo-savepoint | 0.3.4 | 0.3.3-1 | **EAC** |

同版本共享：balance 0.1.0、composer-dynamic-island 2.1.0、plugin-manager 0.1.0、plugin-shield 0.1.0、skin-switch 0.1.0、whale-widget 0.2.10。

冲突预检补充：`dsh-aio-ui-compat` 不得装入 EAC 包（EAC 无此插件也不需要其兼容层）；`dsh-compact`（EAC 1.0.0）与 `dsh-auto-compact`（AIO 0.1.0）功能重叠，两包各装各的，**不得同装一个 profile**。

## 6. 退役排除说明

见 `catalog/retired.json`（16 条台账）。要点：

- EAC main 线退役 8 条（HEAD 注册表 RETIRED_BUILTIN_PLUGINS：auto-compact、plugin-marketplace、webui-market、zat-dsh-engine、third-party-thinking、tool-vision、settings-nav-custom、**dsh-stt**；另 file-drop 旧版被 file-drop-eac 取代）。
- **dsh-stt 修正**：背景清单列为在役（默认禁用），实测 5.3.0 已退役（1.1GB sherpa-onnx ASR 模型不再随包），归入退役台账。
- AIO v1.2.0 移除 6 条（dsh-market、dsh-offpeak、dsh-plugin-marketplace、dsh-skin-switch、dsh-webui-market、dsh-usage-skill；出处 aio-v1 CHANGELOG。其中 skin-switch 现分支已恢复，仅作历史记录）。
- 退役项**不打包、不安装**；老 profile 若有残留 patch 行/包副本，由 EAC 宿主的退役清理逻辑（或 Host 安装器）兜底清除。
- **suite-skins 退役 1 条（v0.2.0）**：maid-atelier-legacy（@dsh-external/dsh-client-ui-skin-maid-atelier 0.0.1，eac-tag 提取占位版）由社区 @smalltailqwq/dsh-client-ui-skin-maid-atelier 0.1.7 正式版取代（见 §4.2），同皮肤新旧两版勿同装。

## 7. 校验与复现

```bash
# 全量重打包（幂等；npm tarball 缓存于 .cache/npm-tarballs）
node scripts/repack/repack.mjs

# 产物校验（index↔catalog 对应、sha256/bytes、tgz 内 package.json、peer 对 0.2.0-rc.2 满足）
node scripts/repack/verify.mjs

# 单项重打（调试）
node scripts/repack/repack.mjs --only viewport-lock
```

产物：`dist/<name>_<version>.tgz` + `dist/SHA256SUMS`（`sha256sum -c` 兼容）+ `dist/index.json`（数组：id/name/version/packs/file/sha256/bytes/source）。
