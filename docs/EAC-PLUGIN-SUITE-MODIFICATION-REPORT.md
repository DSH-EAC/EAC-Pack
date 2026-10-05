# eac-plugin-suite 完整 Git 安装修改报告

## 一、交付结论

本次将整合包统一改名为 **eac-plugin-suite@0.2.2**，并将全部固定基线资源直接纳入 Git 仓库及安装包。最终采用的是“安装时资源已经完整随包交付”，而不是“先安装轻量包，再联网补齐”。

已经完成本地真实 Git 安装、完整资源校验、Release 布局安装及 Desktop 主路径验收。**本地通过不等于远端安装通过，也不等于全部第三方插件的每项功能都已启用验证。**

交付边界：

- 代码及资源已形成两笔本地提交，共 115 个文件；本报告是随后新增的独立文档，不属于这两笔提交。
- 此前助手推送没有成功确认，上传已交给主人接手；本次写报告不再推送，也不重新查询远端状态。
- 本次没有创建或发布 Release，没有发布新的 0.2.2 channel。

## 二、原问题与方案调整

### 2.1 “没有声明组合包”的原因

宿主要求可管理的插件包声明 `dsh.bundle`，并提供可加载的 patch。pnpm 将 Git 仓库作为普通依赖安装成功，只能证明包管理器完成依赖安装，不能证明宿主认可其插件元数据。

原 Git 仓库根目录没有本次新增的可安装根 `package.json`；实际整合包位于 `suite/`，Release 的平铺安装布局与 Git 仓库根布局不同。因此 Git 安装不能直接取得与 Release 相同的入口和组合包声明。

另外，72 项基线资源中有 25 项缺少组合包声明。只修复整合包根入口还不足以让这些子包通过宿主管理检查，需要分别补齐其声明和 patch。

### 2.2 最终方案

按主人的最终要求，撤回“轻量安装后联网补齐基线”的交付方式，改为：

1. 根目录成为正式 Git 安装入口，入口指向 `suite/`。
2. `suite/` 保留平铺 Release 安装入口，两种入口使用相同包名和版本。
3. 全部固定资源作为真实文件直接入 Git，不使用 Git LFS 指针。
4. 大文件切成不超过 40 MiB 的资源块，安装后只做本地校验和拼接。
5. 子包安装使用持久化后的本地 tarball，正常生产路径不联网下载固定基线。

“装完整”指完整交付整合包、目录、预览、Prompt 和固定资源；**不是安装整合包后自动注册或启用全部 72 个子插件**。

## 三、具体修改

### 3.1 包身份与双入口

涉及：`package.json`、`suite/package.json`、`suite/package-lock.json`、`suite/cordis.patch.yml`。

- 根 Git 包和 suite Release 包统一为 `eac-plugin-suite@0.2.2`。
- 根包声明 `main`、`exports` 和 `dsh.bundle.patch`，路径指向 `suite/`。
- 平铺包声明对应的本地入口和 patch，满足宿主组合包识别要求。
- 根包 `files` 明确包含 `suite/package.json`，避免安装后完整性验证器缺少包元数据。
- 两入口均不引入运行时依赖，不使用 `prepare` 或 `postinstall` 下载资源。
- `prepack` 只执行本地完整性门禁，不承担联网补齐。

### 3.2 名称、API、界面和文档统一

涉及：根及 suite README、`suite/index.js`、`suite/client.js`、locale、开发预览文件、API 和分发文档。

- API 前缀改为 `/api/eac-plugin-suite`。
- 客户端模块、slot、显示名称、locale、开发启动和 mock 相关引用同步改名。
- 数据目录改为 `$DSH_HOME/eac-plugin-suite`。
- 首次启动支持复制旧 `$DSH_HOME/plugin-suite` 数据；保留旧目录，不做破坏性迁移。
- README 说明完整 Git 安装、完整资源交付和本地验收边界。
- `suite/scripts/sync-assets.mjs` 自动同步 README，避免两种安装入口说明漂移。
- 历史轻量/fixture 验收文档保留并标明历史性质，不冒充最终全量结果。
- 第三方插件自身的包名、固定版本以及旧渠道的历史文件名，不为品牌改名而伪造或改写。

### 3.3 固定资源完整纳入 Git

涉及：`suite/assets/bootstrap.json`、`suite/assets/payload/`、`.gitignore`、`.gitattributes`。

| 项目 | 内容 |
| --- | --- |
| 基线资源数 | 72 项 |
| 实际 payload 文件数 | 77 个 |
| 资源总字节数 | 302,035,054 bytes |
| 单块最大大小 | 41,943,040 bytes，即 40 MiB |
| 普通 tarball | 70 个 `.tgz` |
| pet | `dsh-pet@0.3.1`，62,222,749 bytes，2 块 |
| dafeiyu | `dsh-dafeiyu@0.1.14`，167,827,628 bytes，5 块 |

- manifest 固定资源身份、版本、完整文件大小及 SHA256，同时记录每个分块大小和 SHA256。
- `.gitignore` 放行正式 payload 的 `.tgz`/`.bin`；缓存、dist 和测试安装包仍不提交。
- `.gitattributes` 将 payload 标记为 binary，防止 Git 换行转换污染摘要。
- 这些文件是真正的资源字节，不是 LFS 指针或占位下载描述。

资源来源是官方旧版 `dist-artifacts-0.2.1.tar.gz`：312,762,001 bytes，完整 SHA256 为：

```text
1e96a5dadecf85eac1c565ce2f2fd5fd64ce9d93d267140c8054c0f09e3aed0c
```

此前通过官方 API 分段下载并核对完整摘要；外层归档存在重复副本，只按 index 导入 72 个 canonical 文件。

### 3.4 本地 ResourceManager

新增：`suite/resources.mjs`。

- 校验 manifest 和资源块，按固定摘要拼接 tarball。
- 处理并发 ensure 去重及取消。
- 将资源持久化到 `$DSH_HOME/eac-plugin-suite/resources/<sha256>/<file>`。
- 避免整合包卸载后，子插件 `file:` 依赖因指向整合包安装目录而失效。
- 必须先校验随包资源；旧缓存不能掩盖本次安装缺失或损坏的 payload。
- 正常生产资源路径不降级到 `latest`，也不联网下载基线。

旧 `resolveTarget` fallback helper 仍保留；生产路径有 ResourceManager 时先执行 ensure，资源失败不会进入 fallback。`DSH_SUITE_NO_RESOURCES=1` 仅用于 fixture/开发隔离，不能作为生产安装方案。

### 3.5 宿主管理、错误识别及 UI

涉及：`suite/index.js`、`suite/client.js`、locale 和相关测试。

- 新增资源状态 API、资源 SSE 与 `POST /resources/retry`。
- 界面显示完整资产状态、进度、失败信息和重试入口。
- 资源 SSE 与子插件安装 Timeline 分离，修复开发过程中出现的界面白屏，并增加回归测试。
- `assertManagementResult()` 识别宿主返回的 `application: 'failed'` 或 error，不再把这类结果误报为成功。
- 通过 `assetFailure` 区分资源失败，避免它误走宿主版本豁免逻辑。
- 其他原有版本豁免逻辑仍保留；本次并非移除全部豁免。
- 保留 EAC-only、kernelProvided、皮肤互斥等守卫，验收没有使用 force 绕过这些限制。

### 3.6 子包组合包声明修复

涉及：`scripts/repack/ensure-bundles.mjs`、`scripts/repack/resource-bundle.mjs`。

- 25 项补齐 bundle；47 项原本已经带有声明。
- 校验原包摘要、身份、归档路径和链接，写入 self-mount patch 及 `dsh.bundle.patch`。
- 直接使用 tar 重归档，不执行下载包的 lifecycle 脚本。
- 校验资源身份、声明路径和 patch 文件存在性。
- 本次没有改写第三方业务实现，也没有逐个补齐所有第三方运行配置。

### 3.7 构建、校验与发布脚本

- `scripts/build-resources.mjs`：校验 dist 身份、摘要、bundle 和 catalog 覆盖；生成分块、manifest，并提供 `--verify`。
- `suite/scripts/sync-assets.mjs`：校验目录、payload、gallery，并同步 README。
- `suite/scripts/verify-package.mjs`：作为两种入口的 prepack 门禁，检查版本、目录覆盖、文件类型、大小、分块和整文件 SHA256。
- `scripts/publish-channel.mjs`：从 package 读取版本，使用新包名及仓库地址；本体缺失时拒绝写占位摘要，修正 suite 本体 Release URL。
- `scripts/publish-resources.mjs`：校验工作区资源及完整安装包存在性；`--dry-run` 不上传，正式路径使用 draft。

发布脚本没有独立解包验证任意旧 tarball 的内容；本次测试包内容一致性由专门的 packed-equality 验收验证。不能将文件存在检查描述为任意安装包内容都经过完整验收。

## 四、验收结果及证据边界

### 4.1 已有验收记录

以下为此前实际执行结果，详见 `docs/FULL-GIT-INSTALL-TEST.md`；本次写报告不重复运行全部 Desktop 和 Git 安装测试。

| 验收项 | 已记录结果 |
| --- | --- |
| 系统 Node 25.9.0 | 41/41 测试通过 |
| Desktop Node 24.21.0 | 41/41 测试通过 |
| 完整资源校验 | 0.2.2 / 72 项通过 |
| 官方 Desktop 本地真实 Git URL 安装 | 成功，pnpm 11.7.0，约 38.1 秒 |
| Git 安装后的全量资源验证 | 72/72，baselineFetches=0 |
| Release 布局安装后的全量资源验证 | 72/72，baselineFetches=0 |
| 逐项 tarball 身份和 bundle | 72/72 通过 |
| Git 与 Release manifest、77 个 payload 摘要 | 一致 |
| Desktop 实际子插件安装 | viewport-lock、blue-fantasy、pet、dafeiyu 成功 |
| 安装任务 | 三次分别 ok=1、1、2，failed=0 |
| 皮肤馆 | 15 项，30 张明暗预览完成浏览器解码 |
| Prompt | 10 项非空内容 |

测试中通过替换 fetch 为“计数后抛错”验证基线不联网；这不是对正常生产下载失败的绕过。Release 的 `--offline --ignore-scripts` 验收基于完整包内资源。

渠道回归测试曾使用固定 50 ms 等待，在 I/O 竞争下误判；改为等待真实 `state.queueTail` 后重跑两种 Node，未削弱成功/失败断言。

### 4.2 本报告写入时的复核

- 核对本地 HEAD 仍为本报告记录的资源提交，前一笔为源码提交。
- 重新执行 `node suite/scripts/verify-package.mjs`，返回 `{ version: '0.2.2', resources: 72 }`。
- `channel/channel.json` 仍是 channelVersion 13，suite 0.2.1，文件名 `dsh-plugin-suite-0.2.1.tgz`。
- 此前 `.cache/full-delivery/` 中的验收日志和 packed-equality 文件当前工作区已不存在；本报告保留已有验收记录，但不声称这些缓存证据现在仍可读取。
- 未查询远端当前 ref；远端是否已经由主人手动上传，应另行核对。

### 4.3 不能从验收中推出的结论

- 没有逐个启用全部 72 项第三方插件，没有证明每项第三方功能均兼容当前 Desktop。
- 实际安装的四个子插件保持 `enabled=false`，未自动开启皮肤或原生桌宠。
- `baselineFetches=0` 只证明固定基线资源无需下载；子插件传递依赖仍由宿主解析，可能需要网络。
- CDP 截图返回黑帧，不能作为像素级视觉通过的证据。UI 验收依据实际点击、DOM、图像解码和运行 API。
- 在线 channel 更新是独立能力，不是启用后补齐固定基线。
- 此前测试 tarball 之后还修改过 README；不能把当时 tarball 的整体摘要当作最终 HEAD 重新打包的摘要。运行时代码及 payload 的已验证结论不因此改变。

## 五、提交和远端交付状态

| 提交 | 内容 |
| --- | --- |
| `b0daf19b3afea3abebbbb604e1b7e5d5f74942c7` | `feat(suite): rename to eac-plugin-suite and support complete Git installation`；38 个代码、配置、清单和文档文件，新增 2845 行，删除 305 行 |
| `912edd5c4f15c9b3645a3912b299d4309f76d021` | `build(resources): include all 72 pinned baseline artifacts as direct Git payload`；77 个真实资源文件 |

分支为 `main`，远端仓库为 `DSH-EAC/EAC-Pack`。包名改为 eac-plugin-suite，并不意味着 GitHub 仓库也被重命名。

此前 HTTPS 上传只有约 40–55 KiB/s，约 288 MiB Git pack 未在当时完成上传。临时代理/HTTP 调整没有确认改善，SSH 443 严格验证后现有 key 被拒绝；没有修改全局 Git 或系统代理。主人接手后，本任务推送进程已停止。

此前最后一次远端核对仍为旧提交 `15672c64bf02f9a4b4464e2bb57fb7931a968e0b`。**这是历史快照，不是本报告写入时的远端状态。**

手动交付参考（以下命令未由本次报告写入操作执行）：

```powershell
Set-Location 'G:\Code\fork\EAC-Pack'
git push origin main
# 如需使用现有本地代理：
git -c http.proxy=http://127.0.0.1:7897 push origin main
# 推送完成后确认远端 ref：
git ls-remote origin refs/heads/main
```

确认目标提交在远端可访问后，固定版本安装 spec：

```text
github:DSH-EAC/EAC-Pack#912edd5c4f15c9b3645a3912b299d4309f76d021
```

本报告自身尚未提交；如需要一起上传，应另行提交该文档。Release 和 channel 发布属于单独操作，不包含在本次写报告请求中。

## 六、文件清单

下表按原基线 `15672c64bf02f9a4b4464e2bb57fb7931a968e0b` 到 `912edd5c4f15c9b3645a3912b299d4309f76d021` 的实际 Git diff 生成。A 为新增，M 为修改，共 115 个文件；不包含本报告或用户并行文档。

| 状态 | 文件 |
| --- | --- |
| A | `.gitattributes` |
| M | `.gitignore` |
| M | `README.md` |
| M | `docs/API-v2.md` |
| M | `docs/DISTRIBUTION.md` |
| A | `docs/FULL-GIT-INSTALL-TEST.md` |
| A | `docs/FULL-INSTALL-TEST-2026-10-04.md` |
| A | `docs/LOCAL-INSTALL-TEST-2026-10-04.md` |
| A | `package.json` |
| A | `scripts/build-resources.mjs` |
| M | `scripts/publish-channel.mjs` |
| A | `scripts/publish-resources.mjs` |
| M | `scripts/repack/ensure-bundles.mjs` |
| A | `scripts/repack/resource-bundle.mjs` |
| M | `suite/LICENSE` |
| A | `suite/README.md` |
| A | `suite/assets/bootstrap.json` |
| A | `suite/assets/payload/@deepseek-ai_dsh-balance-0.1.0.tgz` |
| A | `suite/assets/payload/@deepseek-ai_dsh-client-file-changes-0.1.0.tgz` |
| A | `suite/assets/payload/@deepseek-ai_dsh-conversation-tweaks-0.1.0.tgz` |
| A | `suite/assets/payload/@deepseek-ai_dsh-easy-setup-0.1.0.tgz` |
| A | `suite/assets/payload/@deepseek-ai_dsh-file-changes-0.1.0.tgz` |
| A | `suite/assets/payload/@deepseek-ai_dsh-float-window-0.1.0.tgz` |
| A | `suite/assets/payload/@deepseek-ai_dsh-openclaw-bridge-0.7.0.tgz` |
| A | `suite/assets/payload/@deepseek-ai_dsh-plugin-manager-0.1.0.tgz` |
| A | `suite/assets/payload/@deepseek-ai_dsh-prompt-custom-0.1.0.tgz` |
| A | `suite/assets/payload/@deepseek-ai_dsh-skin-switch-0.1.0.tgz` |
| A | `suite/assets/payload/@deepseek-ai_dsh-terminal-0.1.0.tgz` |
| A | `suite/assets/payload/@dsh-external_dsh-client-ui-skin-deep-whale-day-night-0.1.12.tgz` |
| A | `suite/assets/payload/@dsh-external_dsh-side-session-0.2.8.tgz` |
| A | `suite/assets/payload/@ha-na-bi_dsh-client-ui-custom-0.1.0-rc.6.tgz` |
| A | `suite/assets/payload/@linxin666_dsh-client-ui-skin-blue-fantasy-0.2.0.tgz` |
| A | `suite/assets/payload/@linxin666_dsh-client-ui-skin-dragon-heir-0.1.11.tgz` |
| A | `suite/assets/payload/@linxin666_dsh-client-ui-skin-miku-0.1.11.tgz` |
| A | `suite/assets/payload/@linxin666_dsh-client-ui-skin-minecraft-0.1.11.tgz` |
| A | `suite/assets/payload/@linxin666_dsh-client-ui-skin-qq98-0.1.11.tgz` |
| A | `suite/assets/payload/@linxin666_dsh-client-ui-skin-ths-0.1.11.tgz` |
| A | `suite/assets/payload/@linxin666_dsh-client-ui-skin-trading-0.1.11.tgz` |
| A | `suite/assets/payload/@linxin666_dsh-client-ui-skin-whale-song-0.1.11.tgz` |
| A | `suite/assets/payload/@linxin666_dsh-client-ui-skin-xp-0.1.11.tgz` |
| A | `suite/assets/payload/@nagi-ovo_dsh-visualize-0.1.4.tgz` |
| A | `suite/assets/payload/@nanmicoder_dsh-agent-teams-0.1.13-eac.3.tgz` |
| A | `suite/assets/payload/@smalltailqwq_dsh-client-ui-skin-deep-whale-manager-0.1.6.tgz` |
| A | `suite/assets/payload/@smalltailqwq_dsh-client-ui-skin-maid-atelier-0.1.7.tgz` |
| A | `suite/assets/payload/@smalltailqwq_dsh-client-ui-skin-orca-link-0.1.7.tgz` |
| A | `suite/assets/payload/@vlln_dsh-navbar-0.4.0.tgz` |
| A | `suite/assets/payload/computer-user-0.3.6.tgz` |
| A | `suite/assets/payload/dsh-aio-ui-compat-1.0.0.tgz` |
| A | `suite/assets/payload/dsh-auto-compact-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-better-sidebar-0.15.3-eac.1.tgz` |
| A | `suite/assets/payload/dsh-change-review-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-client-liang-intensity-skin-0.1.7.tgz` |
| A | `suite/assets/payload/dsh-compact-1.0.1.tgz` |
| A | `suite/assets/payload/dsh-composer-dynamic-island-2.1.0.tgz` |
| A | `suite/assets/payload/dsh-dafeiyu-0.1.14.tgz.chunk-000.bin` |
| A | `suite/assets/payload/dsh-dafeiyu-0.1.14.tgz.chunk-001.bin` |
| A | `suite/assets/payload/dsh-dafeiyu-0.1.14.tgz.chunk-002.bin` |
| A | `suite/assets/payload/dsh-dafeiyu-0.1.14.tgz.chunk-003.bin` |
| A | `suite/assets/payload/dsh-dafeiyu-0.1.14.tgz.chunk-004.bin` |
| A | `suite/assets/payload/dsh-dock-settings-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-drag-and-drop-0.1.6.tgz` |
| A | `suite/assets/payload/dsh-eac-core-bridge-1.0.0.tgz` |
| A | `suite/assets/payload/dsh-eac-locale-compat-1.0.0.tgz` |
| A | `suite/assets/payload/dsh-feature-toggles-0.1.1.tgz` |
| A | `suite/assets/payload/dsh-file-drop-eac-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-find-plugin-0.4.0.tgz` |
| A | `suite/assets/payload/dsh-font-custom-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-image-paste-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-meme-0.1.44.tgz` |
| A | `suite/assets/payload/dsh-message-rewind-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-offpeak-9.9.9.tgz` |
| A | `suite/assets/payload/dsh-pet-0.3.1.tgz.chunk-000.bin` |
| A | `suite/assets/payload/dsh-pet-0.3.1.tgz.chunk-001.bin` |
| A | `suite/assets/payload/dsh-pet-settings-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-phone-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-plugin-shield-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-plugin-wallpaper-engine-0.6.7.tgz` |
| A | `suite/assets/payload/dsh-plugin-wizard-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-raw-html-0.6.2.tgz` |
| A | `suite/assets/payload/dsh-session-manager-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-settings-groups-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-settings-scroll-fix-2.0.2.tgz` |
| A | `suite/assets/payload/dsh-soul-md-0.9.0.tgz` |
| A | `suite/assets/payload/dsh-status-rotator-0.33.1.tgz` |
| A | `suite/assets/payload/dsh-theme-endfield-1.1.5.tgz` |
| A | `suite/assets/payload/dsh-think-zh-expand-eac-1.0.1.tgz` |
| A | `suite/assets/payload/dsh-undo-savepoint-0.3.4.tgz` |
| A | `suite/assets/payload/dsh-unified-market-0.4.1.tgz` |
| A | `suite/assets/payload/dsh-viewport-lock-1.0.1.tgz` |
| A | `suite/assets/payload/dsh-web-mobile-fix-1.0.6.tgz` |
| A | `suite/assets/payload/dsh-webui-prompt-optimizer-0.1.0.tgz` |
| A | `suite/assets/payload/dsh-whale-widget-0.3.17.tgz` |
| A | `suite/assets/payload/meow-smooth-0.8.1.tgz` |
| A | `suite/assets/payload/picturereader-3.3.1.tgz` |
| M | `suite/client.js` |
| M | `suite/cordis.patch.yml` |
| M | `suite/dev/boot.mjs` |
| M | `suite/dev/mock-data.mjs` |
| M | `suite/dev/preview.html` |
| M | `suite/dev/serve.mjs` |
| M | `suite/index.js` |
| M | `suite/locale/en.json` |
| M | `suite/locale/zh.json` |
| M | `suite/package-lock.json` |
| M | `suite/package.json` |
| A | `suite/resources.mjs` |
| M | `suite/scripts/sync-assets.mjs` |
| A | `suite/scripts/verify-package.mjs` |
| M | `suite/test/channel.test.mjs` |
| A | `suite/test/client-resources.test.mjs` |
| A | `suite/test/full-package.test.mjs` |
| M | `suite/test/host.test.mjs` |
| M | `suite/test/issue1-hardening.test.mjs` |
| A | `suite/test/resource-publication.test.mjs` |
| A | `suite/test/resources.test.mjs` |
## 七、相关文档与后续检查

- `docs/FULL-GIT-INSTALL-TEST.md`：最终全量 Git/Release 和 Desktop 主路径验收。
- `docs/DISTRIBUTION.md`：分发与安装说明。
- `docs/API-v2.md`：API 说明。
- `docs/FULL-INSTALL-TEST-2026-10-04.md`：历史机制/fixture 验收，不等同于最终生产资源验收。
- `docs/LOCAL-INSTALL-TEST-2026-10-04.md`：历史轻量方案记录，不是当前交付方式。

下一步是确认远端包含完整资源提交，再由主人在 Desktop 手动复验远端 Git 安装。若出现问题，应提供完整安装日志、宿主版本及资源状态，分别判断组合包识别、资源完整性和第三方运行兼容性；不混为同一个“安装成功”。
