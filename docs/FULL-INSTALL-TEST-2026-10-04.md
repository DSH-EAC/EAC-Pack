# eac-plugin-suite 安装即完整：机制验收（2026-10-04）

> 历史机制记录：此后已取得全部生产资源，并完成完整 Git 安装验收。最新结论见 `FULL-GIT-INSTALL-TEST.md`；下文保留当时的证据与边界。

## 状态

最终方案为 **Git 与 Release 直接携带完整 payload**，不是启用后下载，也不是 URL 资源子依赖。源码改动和机制测试已完成；**72 项生产资源尚未取得、修正和完整打包，不能宣称交付完成。**

## 为什么撤回资源依赖方案

实际 Desktop 的 pnpm 11.7.0 对 tarball URL 子依赖返回 `ERR_PNPM_EXOTIC_SUBDEP`，默认 blockExoticSubdeps 阻止该路径。本地 file: 子依赖通过不等于远端 URL 子依赖通过，因此没有关闭安全策略绕过，而是撤回依赖方案。

最终根包和 suite 包均无运行时依赖。全部资源直接放入 assets/payload；大资源构建时拆成不超过 40 MiB 的实际字节文件，随 Git 提交而非 LFS 指针。安装完成即已有资源，启用后仅本地校验和拼接。此方式会增大 Git 首次下载及二进制历史。

## 实际验证

测试使用一个经过组合包声明修复的 `dsh-viewport-lock@1.0.1`，拆为两个本地分块。**这是明确标注的单资源夹具，不是生产 72 项整合包。**

- 本地 pnpm 11.7.0：`--offline --ignore-scripts` 成功安装直接内置包，只添加 1 个包，无资源依赖。
- 新隔离 Desktop `DSH_HOME=G:\Code\fork\EAC-Pack\.cache\full-desktop\home`；用户配置在同目录 user-data。日常 ~/.dsh 未修改。
- 官方安装对话框成功装入直接内置夹具，重启后 API `resources.mode=installed, state=ready, total=1, completed=1`。
- 为排除旧缓存掩盖新方案，先卸载测试子插件，再将测试缓存摘要目录移动至任务内 held-resource-before-direct-test（保留原文件，不删除）。重新校验生成新 tarball，完整 SHA256 匹配。
- 随后实际安装任务 `job-1791129066013`：`step-ok` 1 次，`job-done ok=1 failed=0`；子插件保持禁用，目标路径在持久化缓存中。
- 之前重复安装已有子插件被宿主报 ambiguous-install，正确作为失败处理；卸载后再装成功，没有通过掩盖失败取得成功结果。
- 设置页实际显示完整资产就绪；slot error 为 0。未自动启用第三方插件。
- 39/39 回归测试在本机 Node 25.9.0 与 Desktop 随附 Node 24.21.0 均通过。覆盖直接 payload、分块拼接、完整摘要、旧缓存不能遮蔽缺失文件、损坏失败、安装目标持久化、无下载、组合包门禁及真实客户端事件。
- 相关脚本语法与 git diff --check 通过。

## 构建/交付门禁

- ensure-bundles 直接重归档并加入组合包声明，不执行第三方生命周期脚本；检查源摘要、身份、归档路径及链接。
- build-resources 检查全目录覆盖、包身份、完整摘要和声明，再生成直接随包分块。
- root 和 suite 的 prepack 均校验全部 payload 与清单版本。不完整安装包不能按正常 npm pack 发布。
- 当前真实 `npm pack` 被门禁阻止：旧 manifest 为 0.2.1、代码为 0.2.2，且完整 payload 尚未生成。这是正确阻止，不是成功打包。

## 生产资源阻塞

官方 v0.2.1 Release 资源归档 `dist-artifacts-0.2.1.tar.gz` 大小 312,762,001 bytes，Release SHA256 为 `1e96a5dadecf85eac1c565ce2f2fd5fd64ce9d93d267140c8054c0f09e3aed0c`。

使用 gh release download、官方 API 下载及范围读取均遇到断线/TLS handshake timeout，未取得摘要验证通过的完整归档。部分下载文件未用作构建源；此前仅下载的 15 项不能充当 72 项完整集。也没有将旧资产摘要改为假的 0.2.2 清单。

下一步需要一份可靠的完整旧包（原 dsh-plugin-suite-0.2.1.tgz 或 dist-artifacts-0.2.1.tar.gz）作为构建源，或网络恢复后完整取回；随后修正每个子插件的 bundle、生成分块、双入口打包、全量本地验收。可以提供本地完整安装包路径继续。

## 本地证据

- `G:\Code\fork\EAC-Pack\.cache\full-desktop\direct-evidence.json`
- `G:\Code\fork\EAC-Pack\.cache\full-desktop\direct-ready.png`
- `G:\Code\fork\EAC-Pack\.cache\full-desktop\home\eac-plugin-suite\events.jsonl`
- `G:\Code\fork\EAC-Pack\.cache\direct-full-fixture\`：直接内置测试夹具。

旧 full-install-fixture 是已撤回的 file: 资源依赖测试，不作为最终方案的证据。原轻量补齐报告也仅作历史记录。用户的 EAC-SKIN-LOADER-GOAL-PLAN.md 未修改。

测试结束关闭任务隔离 Desktop，保留夹具、缓存和证据。未提交、推送、发布，未降低 pnpm 安全策略。
