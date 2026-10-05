# eac-plugin-suite 0.2.3 级联安装验收（2026-10-05）

## 结论与发布边界

本地实现及官方 Desktop 验收通过：Git 轻入口通过必选精确 registry 依赖安装完整基线，启用后只做本地校验。完整单文件 Release 使用标准 bundleDependencies 内置相同资源包，独立空 store 的离线安装通过。

**生产交付尚未完成。** 本机 `npm whoami --registry=https://registry.npmjs.org/` 返回 ENEEDAUTH；公开查询 `eac-plugin-suite-assets@0.2.3` 返回 E404。未获得发布凭据前，不推送一个依赖不存在版本的 Git 入口。远程 Git 安装按用户要求留待手动测试；这不豁免资源包先发布的前提。

## 实现

- 两个入口统一为 eac-plugin-suite@0.2.3，dependencies 精确指定 eac-plugin-suite-assets@0.2.3；不是 optional/peer，没有 prepare/install/postinstall 基线下载器。
- 主 Git 只保留 bootstrap manifest、目录、host/client、locale、图标和实际构建/校验代码。payload、gallery、preview、Prompt 退出跟踪，但本地原文件、staging 和完整产物均保留。
- 资源包纯数据，无运行时依赖、生命周期脚本或 dsh 声明；72 个子插件 tarball 自身有合法组合包 patch。保留来源与第三方许可。
- 标准 Node 依赖解析跟随真实入口路径，支持 pnpm symlink / hoisted 和完整 Release 的嵌套 node_modules，不硬编码 .pnpm。
- 入口固定资源身份、版本、完整清单与所有摘要。缺依赖、错版本、清单差异、损坏或链接冒充数据会失败；不回退上游/latest，不借旧缓存掩盖不完整安装。
- 子插件 tarball 校验后持久化到 DSH_HOME/eac-plugin-suite/resources/<sha256>/，保持禁用与兼容性守卫。
- 删除旧 0.2.2 开发 package-lock；原文件保留在 ignored cache。不能编造尚未发布依赖的生产 integrity；生产依赖发布后按真实 registry 重建开发锁文件。

## 验收证据

官方 Desktop：0.2.0-rc.2；自带 pnpm 11.7.0 / Node 24.21.0，另用系统 Node 25.9.0 回归。隔离 DSH_HOME 与 Electron userdata 均在 .cache/cascade/desktop/，未修改用户日常 profile。

1. **轻入口级联安装**：本地 HTTP 测试 registry 提供普通 semver 元数据和固定数据 tarball。独立空 store 安装 Packages +2；无安全策略关闭，无 exotic URL 子依赖。fixture 的发布时间固定在过去，仅用于机制测试，不冒充生产发布时间。
2. **完整 Release 离线安装**：另一独立空 store，pnpm --offline --ignore-scripts，Packages +1。必选资源实际随 tarball 内置，不是悬空链接。
3. **两种安装后的全量本地校验**：均 ready，72/72，302,035,054 payload bytes；完整摘要与所有分块匹配。资源管理器不 fetch 基线。
4. **官方添加插件界面**：输入最终轻入口 tgz，成功识别 eac-plugin-suite 组合包；资源依赖一并装入。启用后 API 200，resources.state=ready、completed=total=72。
5. **真实子插件安装**：viewport-lock@1.0.1、blue-fantasy@0.2.0、pet@0.3.1、dafeiyu@0.1.14，任务 ok=4 / failed=0；四项 installed=true、enabled=false。验证了 62 MB 与 168 MB 分块大包拼接和宿主管理路径。
6. **皮肤资源**：gallery 15 项，30 张预览在浏览器中逐张 decode 且 naturalWidth>0；10 组 Prompt 返回非空内容。不是像素级截图或上游皮肤兼容性验收。
7. **卸载/重装入口**：仅在隔离 profile 卸载旧测试入口，四个子插件保留。安装最终产物后重新启用与复验；14 个实际安装核心文件摘要与最终源码一致。
8. **必选依赖故障**：另一 404 registry 与空 store 使安装 exit=1，主包未保存为已安装依赖。不会返回一个缺资源的“成功”入口。
9. **回归**：两种 Node 各 44/44 tests；syntax、资源 build --verify 与 diff --check 通过。单测覆盖资源缺失/损坏、版本和清单不匹配、安全路径、纯数据依赖、symlink 入口解析及既有宿主守卫。

上述 registry 是 localhost fixture，不是公开 npm 发布或镜像下载验收。子插件全部已具备基线不等于 72 个第三方插件均启用/兼容，也不等于所有第三方传递依赖离线可用。

## 产物与体积

Ignored `.cache/cascade/artifacts/`：

| 产物 | bytes | SHA256 |
| --- | ---: | --- |
| assets/eac-plugin-suite-assets-0.2.3.tgz | 333,972,748 | 5e2f58b77ce9e53a36c4001d2d74cab23f18adb9618b65f18ed5a9ceecd3b556 |
| git/eac-plugin-suite-0.2.3.tgz | 88,478 | 见本地实际文件与 packed-evidence.json |
| release/eac-plugin-suite-0.2.3.tgz | 334,062,800 | ed59518b37e6783643145dccfb65924beba2ba954a287a4f2bd001fd7d09e14e |

轻入口不足 100 KB，但安装时仍需约 334 MB 的资源下载；级联安装不是消除资源传输。

原 HEAD 树 346,983,586 bytes；远端基线树 44,836,149 bytes。退出 payload 与 preview 等资源跟踪后，交付树约 12.6 MB。树体积不等于 Git pack、完整历史或下载流量。旧 payload 提交尚未进入远端，交付分支不能保留它为祖先；原本已存在于远端基线历史中的素材不能靠本次删除消失。

## 后续交付步骤

1. 用户登录 npm：`npm login --registry=https://registry.npmjs.org/`，不要在聊天或 Git 中提供 token。
2. `node scripts/publish-resources.mjs --dry-run` 全量检查，不上传；有凭据后去掉 --dry-run，发布资源包并自动进行生产冷缓存下载与摘要校验。
3. 若用户自行发布相同产物，运行 `node scripts/verify-published-resources.mjs`；生产 receipt 保存在 ignored artifacts。失败即停止推送。
4. 不覆盖已发布字节，不关闭 minimumReleaseAge / 供应链策略；镜像同步或发布年龄等待应明确记录。
5. 验证生产依赖后，推送干净的轻入口提交并用 ls-remote 核对实际远端 ref。不能推备份分支或使用 push --all。
6. 完整 Release 已准备，可单独上传 release/ 下产物；上传完整 Release 不等于公开 registry 资源依赖已发布。
7. 用户手动测试远端 Git 安装，保留真实日志与结果。

## 可复核的本地证据（均不提交）

- .cache/cascade/tests-node24.log / tests-node25.log
- .cache/cascade/artifacts/packed-evidence.json
- .cache/cascade/offline-evidence.json
- .cache/cascade/final-git-install.log / final-release-install.log
- .cache/cascade/missing-install.log
- .cache/cascade/registry-requests.json
- .cache/cascade/desktop-evidence.json
- .cache/cascade/installed-source-equality.json
- .cache/cascade/desktop/home/eac-plugin-suite/events.jsonl
- .cache/cascade/user-doc-hashes.json（用户并行文档未修改、未纳入本轮提交）

## 本地提交与历史整理结果

2026-10-05 已从核对的远端基线 15672c64bf02f9a4b4464e2bb57fb7931a968e0b 重新组织本地未推送提交；原 912edd5 及直接内置方案保留在本地 backup/pre-cascade-20261005，不是 main 的祖先，也不会推送备份 ref。代码提交为 3f4e1b9；代码阶段树为 12,486,761 bytes，加入文本验收文档后略增。未强推或改写远端。

用户并行的 EAC-SKIN-LOADER-GOAL-PLAN.md 和 EAC-PLUGIN-SUITE-MODIFICATION-REPORT.md 与启动时 SHA256 一致，仍保持 untracked，不纳入本轮提交。生产资源发布未满足之前，main 的本地提交仅为待交付状态，不能宣称远端 Git 已可安装。
