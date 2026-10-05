# Handoff：eac-plugin-suite 0.2.3 级联安装与发布

交接日期：2026-10-05（Asia/Shanghai）。仓库：DSH-EAC/EAC-Pack；分支：main。

## 1. 接手结论：代码可交接，生产安装尚不可交付

用户因本机网络不佳，明确要求先把现有 Git 代码和交接文档推送，交由另一位执行者完成资源发布。**这是源码交接，不是正式安装可用公告。**

当前根包与 suite 包都精确依赖 **eac-plugin-suite-assets@0.2.3**。交接时本机 npm 未认证（whoami 返回 ENEEDAUTH），公开查询该资源版本返回 E404。在资源包公开可解析之前，直接安装 github:DSH-EAC/EAC-Pack 预计会因必选依赖缺失而失败；不要宣布它已可正常远端安装。

本轮不上传完整资源到 Git，不推备份分支，不强推远端，不把测试 registry 或用户 profile 当生产交付物。网络差不只是发布障碍；npm 登录与包名发布权限也必须由接手者解决。

## 2. 原目标与不能退让的边界

目标是：官方 Desktop 能通过 Git 安装整合包，在安装事务结束时获得与完整 Release 相同的基线能力，不在启用后继续补下载；资源本体不进入主 Git。

- 入口：eac-plugin-suite@0.2.3，保留 dsh.bundle.patch、host/client、locale、目录、bootstrap manifest。
- 级联：普通 dependencies 精确指定 eac-plugin-suite-assets@0.2.3，不是 optional/peer，也不是远端 tarball URL 子依赖。
- 数据包：72 个基线子插件 tarball、30 张 preview、10 组 Prompt 和 gallery；无生命周期脚本、无运行时依赖、无可启用的 dsh 声明。
- 完整 Release：npm bundleDependencies 内置同一数据包，可单文件离线安装整合包本身。
- 启用：仅本地身份/版本/清单/大小/SHA256 校验与大包拼接，不 fetch 基线，不回退 upstream/latest，不借旧缓存掩盖缺失。
- 子包：校验后持久化 tarball 再交给宿主 pluginManager；仍由用户选择安装与启用，兼容性、内核重复包、皮肤互斥守卫保留。
- 不关闭 pnpm 供应链、blockExoticSubdeps 或 minimumReleaseAge 等安全保护。此前 URL 子依赖方案不能恢复为替代品。

## 3. Git 与代码入口

交接前已有本地提交：

- 3f4e1b9：级联实现，包含改名、双入口、资源解析/完整性、构建与测试。
- 9d7e64f：实施建议和完整验收记录。
- 本交接提交及用户要求追加的两份文档随后提交；接手后以 `git log -5 --oneline` 获取最终交接 HEAD，不用以上旧 HEAD 安装来替代最终版本。

已核对的旧远端基线：15672c64bf02f9a4b4464e2bb57fb7931a968e0b。main 从该基线重组未推送提交，是 fast-forward，不包含 912edd5 的 302 MB payload 提交祖先。原提交仅在本地 backup/pre-cascade-20261005，**禁止 push --all 或推送此备份 ref**。

主要文件：

| 文件 | 职责 |
| --- | --- |
| package.json / suite/package.json | Git 根入口 / 平铺 Release 入口，同名同版本与精确依赖 |
| suite/cordis.patch.yml | 官方 Desktop 组合包识别 |
| suite/asset-package.mjs | 跟随真实入口路径的 Node 标准依赖解析、数据包契约与附加资产校验 |
| suite/resources.mjs | 基线 tarball 校验、分块拼接、持久化，无下载器 |
| suite/index.js | 宿主服务、API、任务与兼容性守卫 |
| suite/assets/bootstrap.json | 固定资源版本、72 项/77 个 payload 文件及额外资源摘要 |
| scripts/build-resources.mjs | 从 dist 与视觉输入构建 ignored 资源 staging；--verify 全量检查 |
| scripts/pack-delivery.mjs | 数据包、小 Git 包和完整 Release 的实际打包门禁 |
| scripts/publish-resources.mjs | 发布数据包；--dry-run 不上传，正常发布后做生产冷下载校验 |
| scripts/verify-published-resources.mjs | 校验公开 registry 身份与 tarball 完整性，写本地 receipt |

README 与 suite/README 保持一致。旧 suite/package-lock.json 已删除：它是 0.2.2 开发锁文件，不包含新资源依赖；不能伪造未发布依赖的 integrity。接手者需在生产发布后按真实 registry 重建需要保留的开发锁文件。

## 4. 已完成的实际验证及边界

依据本机保存的日志和 runtime 证据，不需要先重复大规模本地测试：

- 官方 Desktop 0.2.0-rc.2，自带 pnpm 11.7.0 / Node 24.21.0；另用 Node 25.9.0。两种 Node 各 44/44 tests。
- HTTP localhost registry 提供普通 semver 元数据；独立空 store 安装轻入口，Packages +2。使用 --ignore-scripts，不关闭安全策略。fixture 发布时间设为过去，不能当生产发布时间。
- 完整 Release 在另一个空 store --offline --ignore-scripts 安装成功，Packages +1；资源依赖是真实文件，不是悬空链接。
- 两条路径安装后全量本地校验：ready、72/72、302,035,054 payload bytes。
- 官方添加插件对话框识别并安装轻入口，启用 API 200、ready 72/72；不是只检查 package.json 声明。
- viewport-lock@1.0.1、blue-fantasy@0.2.0、pet@0.3.1、dafeiyu@0.1.14 通过宿主真实安装，ok=4 / failed=0、全部 enabled=false；覆盖约 62 MB 和 168 MB 的分块资源。
- gallery 15 项、30 张预览浏览器 decode 成功、10 组 Prompt 非空；不是截图像素验收或所有第三方 UI 兼容性验收。
- 隔离 profile 卸载入口后四个子插件保留，重装最终产物再验收；14 个安装核心文件与最终源码摘要一致。
- 404 registry 测试：必选依赖缺失使 pnpm exit=1，主包未保存为成功安装；错版本、清单差异、损坏、symlink 及纯数据约束有单测。

**仍未完成：**公开 npm 发布与生产冷下载、镜像同步/发布年龄兼容性、远端 Git 安装、完整 Release 上传。远端 Git 安装按用户要求由用户之后手动测试。不能将以上 localhost 证据改写成生产验收通过；完整资源可用也不代表 72 个子插件全部启用/兼容或其全部传递依赖离线可用。

隔离 Desktop 和本轮 registry/CDP 辅助进程已关闭。用户日常 profile 未修改。

## 5. 必须另行交接的文件（不在 Git 中）

**只克隆 Git 无法继续生产资源发布。最小必需移交物是已经验过的资源包 tgz。** 本机可通过局域网、移动存储或用户选择的文件传输方式交给接手者；不要将其重新提交 Git。

本机工作区：G:\Code\fork\EAC-Pack。

| 产物绝对路径 | bytes | SHA256 |
| --- | ---: | --- |
| G:\Code\fork\EAC-Pack\.cache\cascade\artifacts\assets\eac-plugin-suite-assets-0.2.3.tgz | 333,972,748 | 5e2f58b77ce9e53a36c4001d2d74cab23f18adb9618b65f18ed5a9ceecd3b556 |
| G:\Code\fork\EAC-Pack\.cache\cascade\artifacts\release\eac-plugin-suite-0.2.3.tgz | 334,062,800 | ed59518b37e6783643145dccfb65924beba2ba954a287a4f2bd001fd7d09e14e |

第二个完整 Release 可直接另行移交，也可在接手者机器从资源包 staging 重建，不必强制传输两个约 334 MB 文件。git/ 下 88,478 bytes 的同名 tgz 是轻入口，不是完整 Release，README 后续交接文字也会改变其重打包大小。

可选输入：

- .cache/resource-package/package/：完整数据包 staging；移交 tgz 后可重新解包得到，不必再传一份。
- dist/index.json、dist 下 72 个 canonical tarball、.cache/asset-input/{gallery.json,previews,prompts}：若要从原输入重跑 buildResources，则需这些 ignored 输入。只解包资源包进行发布/完整 Release 打包不要求先恢复 dist。
- .cache/cascade/artifacts/packed-evidence.json、desktop-evidence.json、offline-evidence.json、installed-source-equality.json、git-delivery-evidence.json、tests-node24.log / tests-node25.log：可选择性移交验证证据。

**不要复制整个 .cache、DSH_HOME、Desktop profile、.npmrc、credentials、会话或所有日志。** 其中可能有本机路径、会话与认证信息。仅复制明确列出的产物或已检查的证据；不要将 npm token 放在聊天、Git 或交接归档里。

## 6. 接手者的最短执行路径

前提：Node >=22、npm、系统 tar 可用；Windows 路径以下示例，换成接手者实际路径。使用全新 checkout，先核对 main、HEAD、未提交文件和仓库指令。

### A. 校验移交文件并恢复 ignored staging

将资源包保存为 C:\handoff\eac-plugin-suite-assets-0.2.3.tgz，先验证：

```powershell
Get-FileHash -Algorithm SHA256 C:\handoff\eac-plugin-suite-assets-0.2.3.tgz
# 必须等于上表资源包 SHA256，大小也必须一致。
```

在仓库根目录执行（目的目录存在时主动停止，避免覆盖接手者已有工作）：

```powershell
node --input-type=module -e "import fs from 'node:fs'; import {unpack} from './scripts/pack-delivery.mjs'; if(fs.existsSync('.cache/resource-package')) throw Error('staging already exists; inspect before continuing'); unpack('C:/handoff/eac-plugin-suite-assets-0.2.3.tgz', '.cache/resource-package');"
node scripts/build-resources.mjs --verify
node --test suite/test/*.test.mjs
```

解包器会检查 archive 路径、链接及特殊文件；--verify 校验入口固定清单、资源包纯数据结构、完整 payload 及额外资产摘要。资源包内已保存 bootstrap 与 SOURCES.json；不要拿上游旧归档覆盖这份重新归档过且补齐组合包声明的 72 项资源。

### B. 确认权限与再分发权利

- npm 登录与包名权限由接手者自己取得：`npm login --registry=https://registry.npmjs.org/`，随后 whoami。
- 交接前公开包名返回 E404，但不证明名称永远可注册；发布前重新查询。如被占用，先协调更名并同步两处 dependencies、asset resolver 常量、构建器与 manifest，再完整测试，不能静默替换。
- 检查 SOURCES.json、第三方包内许可证与素材许可。部分资源有非商业限制，某些条目标记 NOASSERTION；既有分发不自动构成新的公开 npm 再分发授权。无法确认权利时先联系维护者，不默认扩大许可。
- 大约 334 MB 的数据包尚未实测 npm 大小限制；若服务拒绝，应按真实错误处理，先提出版本化的多 registry 数据包拆分方案，不恢复 Git 重资源或安装后下载，也不绕过安全策略。

### C. 发布与生产验证

```powershell
node scripts/publish-resources.mjs --dry-run
# 确认发布权限、公开再分发授权和实际内容后：
node scripts/publish-resources.mjs
```

正常发布脚本会先全量打包校验、确认 whoami，再 publish，最后调用生产下载验证器。使用公共 npm registry，不要把本机 fixture 地址发布到 package metadata 或 lockfile。

若发布成功但后续验证因网络失败，**不要重复发布或覆盖版本**。先公开查询是否已有相同版本，再运行：

```powershell
npm view eac-plugin-suite-assets@0.2.3 name version dist --json --registry=https://registry.npmjs.org/
node scripts/verify-published-resources.mjs
```

生产验证会用独立 cache 下载实际 tarball，校验 registry sha512、完整本地摘要与72/72资源，receipt 在 .cache/cascade/artifacts/production-registry-evidence.json。此验证器依赖本地 restored staging，故必须先完成 A。

### D. 打包完整 Release 与正式安装验收

```powershell
node scripts/pack-delivery.mjs
```

产物在 ignored .cache/cascade/artifacts/{assets,git,release}/。仅 release/ 下整合包是完整单文件 Release；不得把 assets/ 下纯数据包作为 Desktop 插件添加。

- 保留独立空 store 的完整 Release --offline --ignore-scripts 安装验收；按实际主机/包布局定位依赖，校验72/72。
- 在官方 Desktop 隔离 DSH_HOME 与 userdata 中用轻入口安装，此次必须使用生产 registry，不用 localhost。启用检查 /api/eac-plugin-suite/status 为 ready72/72。
- 检查使用者实际 registry 的镜像同步和 minimumReleaseAge，必要时等待；不能关闭安全策略来宣称成功。
- 把真实生产 receipt、镜像可用性和验收边界更新到交接/验收文档。只在成功证据齐全后删除 README 的待发布警告。
- 完整 Release 与 channel 发布不是本次源码推送；与仓库维护者确认后再创建/上传，禁止覆盖已发布版本的固定字节。用户远端 Git 测试仍留手动，不把“源码已推送”当成安装验收。

## 7. 文档优先级与并行任务

- 本文是当前交接状态；CASCADE-INSTALL-TEST-2026-10-05.md 是级联验收记录。
- GIT-INSTALL-DISTRIBUTION-CHANGE-PROPOSAL.md 保存对话演变、架构选择与完整实施方案，部分矩阵仍是计划而不是已通过的验收。
- EAC-PLUGIN-SUITE-MODIFICATION-REPORT.md 是用户要求一并提交的 **0.2.2 直接内置方案历史报告**，正文保留原样，不代表0.2.3还把payload放Git。
- EAC-SKIN-LOADER-GOAL-PLAN.md 是用户要求一并提交的 **另一仓库 EAC-skin-loader 的计划**，不是本任务的实施范围，不在 EAC-Pack 中执行它。
- FULL-GIT-INSTALL-TEST.md 等历史报告保留原版本与历史边界，不可借其结论替代当前生产 registry 验收。

## 8. 交接完成与原目标完成不是一回事

本轮目标是将现有源码、两份用户文档和可操作 Handoff 提交到远端，供其他人继续。远端推送以 ls-remote 与本地 main 相同为准；不因 Writing objects 完成就判定成功。

原目标仍未完全达成：正式 Git 全功能安装依赖生产资源发布。接手者必须完成生产发布/校验并取得相应验收证据后，才能宣布正式交付完成。若移交资源 tgz 没有到位，首先向主人取得第5节产物，不要重新从缺资源的 Git checkout 猜测或编造产物。
