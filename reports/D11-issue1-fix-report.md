# D11 — issue #1 修复报告（dsh-plugin-suite 0.2.1 / channel v13）

> 对应 issue：[#1 官方内核 0.2.0-rc.2 上共 4 处问题：2 处致命（应用无法启动 / 全部会话无法恢复）](https://github.com/zouyuxuan122/EAC-Plugin-Integration-Pack/issues/1)
> 日期：2026-10-02 · 全部修复在官方 0.2.0-rc.2 真机（DSH_HOME=`~/.dsh`，desktop profile）逐项验证。

## 修复总览

| # | 缺陷 | 修复 | 验证 |
| --- | --- | --- | --- |
| 1 | side-session / easy-setup 等待分叉版专有服务 `settingsScope`，被启用后应用无法启动 | 三层：① catalog 标记 `compat: "eac-fork"`，安装/更新一律跳过；② `/enable` API 直接 409 拒绝（UI 同步锁定勾选，红徽章「仅 EAC 内核」）；③ 纵深：重打包内 bundle 行固定 `disabled: true`（side-session 改写自带补丁、easy-setup 新增补丁并声明 `dsh.bundle.patch`）——即使被手工加回 `dsh.profile.bundles` 也只会得到一个停用行，不再阻塞 web boot | 真机把 side-session 手工加回 bundles → 启动干净（无新 crash log、无 entries-did-not-activate）；`/enable` 三个条目均 409 |
| 2 | 重打包 `dsh-plugin-manager@0.1.0` 残留遮蔽内核官方包 → 全部会话无法恢复 | 四层：① catalog 标记 `kernelProvided: true`（真机 asar 实测内核自带 `dsh-plugin-manager`/`dsh-terminal` 均为 **0.2.0-rc.2**，修正了 notes 里 0.1.6-alpha.2 的误记），安装/更新跳过；② **boot ghost sweep**：apply 启动即清扫「无任何清单声明」（deps/bundles/pnpm-lock/listBundles 四重守卫）的目录；③ **离线退役**：已声明安装的副本在 apply 启动时直接改写 profile 清单 + 删目录（内核 profile watcher 自动调和 lock）——刻意不等待 pluginManager 绑定（见"关键发现 A"）；④ 纵深：重打包 plugin-manager 补 `exports["./tools"]`，即使将来再残留也不会让 `tool-plugin-manager` 行因 ERR_PACKAGE_PATH_NOT_EXPORTED 起不来 | 真机植入与报告者一致的幽灵目录 → apply 启动后 3ms 清除（trace `ghost-sweep-remove`）；构造已声明残留 → boot 时清单+目录一并清除，manifest 复核干净 |
| 3 | `dsh-compact` 裸 id 定向补丁 → `entry compact not found`，静默不挂载 | 重打包覆写为 **insert 双行**自挂载：`compact`（主行）+ `compact-agent`（`dsh-compact/agent` 引擎行——压缩引擎在 agent 半边，只挂主行等于只挂设置壳）；版本 1.0.0 → **1.0.1** 让已装用户经渠道收到修复 | 真机重装 1.0.1 → 重启无 loader 报错、无 boot 门禁触发（pend 行会致命，干净启动即激活证据）；bundle 1.0.1 enabled；其 status/compact-now 端点与设置卡片依赖分叉版 `agentPresets`/`settingsScope`，官方 RC2 上不可用（无害的懒注入 pending，已在 catalog notes 注明）——压缩功能本身只依赖 llm/tokenMeter/sessions，RC2 齐备 |
| 4 | `dsh-skin-switch` remote face mount 失败 | 上游 typert codec 兼容问题，非整合包可修；维持 catalog notes 既有记录（皮肤包直接启用可用，D9/D10 实测） | — |

## 配套硬化（本轮真机事故驱动）

- **post-job sweep**：每次 install/update/channel-update 任务结束后清扫目录残留。真机实测：内核 `installBundle` 对 plugin-manager 0.1.0 **假成功**（返回 ok 但 listBundles 始终不收、文件落盘）→ 既有"诚实核对"报失败后，sweep 自动清除了全部残留文件（events: `removed undeclared node_modules residue: @deepseek-ai/dsh-plugin-manager`）。
- **repack `--only` 修复**：此前 `--only` 会整体重写 `index.json` 并把其余 70+ 个 tgz 当孤儿清掉（数据事故陷阱）。现在 `--only` 走合并模式：index 合并、孤儿清理只限本轮重建包的旧版本文件。另发现 Windows 文件锁会令 rmSync 静默失败（旧孤儿复活），已手工复核 dist 与 index 一致（72 项）。
- **UI**：`compat`/`kernelProvided` 透传 status/updates；插件管理与更新中心对两类条目锁定勾选/更新按钮，徽章带 issue 编号说明；更新中心不再列出这两类条目。
- **force 逃生通道**：`/install`、`/enable` 支持 `force: true`（UI 不提供，仅供确知风险的 EAC 内核用户手工调用）。

## 关键发现（真机新证据）

- **A. 幽灵会杀死 pluginManager 服务本身**（比 issue 报告的"会话无法恢复"更重）：`@deepseek-ai/dsh-plugin-manager` 残留在 profile node_modules 时，内核 `pluginManager` 服务投递直接失败（`pmCall` 报 unavailable，与 02:43 boot 实测一致；删除残留后同一服务立即恢复绑定）。因此一切"等服务可用再清理"的方案都会死锁——boot 自愈必须是离线的。
- **B. 自愈收敛需要两次重启**：内核在套件 apply 之前就尝试投递服务，当轮已失败的服务不会重试。所以 sweep/retire 在当轮清除状态、下一轮 boot 完全恢复（02:46 → 02:47 实测收敛）。
- **C. 内核对同名包有部分自我保护**：installBundle 装内核自带的 `@deepseek-ai/dsh-plugin-manager` 时，文件落盘但拒绝登记（listBundles 永远不收）——这正是"幽灵"形态的来源；文件本身必须由整合包侧清扫。
- **D. 行级硬钉能阻断 client 侧 pending 门**：side-session 在 bundles 中启用时，主进程行被补丁固定 disabled 后，其渲染进程 client（inject `settingsScope`）根本不会被加载——web boot 门禁不再触发。

## 测试与验证

- 单测 **18/18**（原 12 + 新 6：skip 语义、enable 守卫、sweep 四守卫、listBundles 守卫、离线退役、force 通道）。
- 真机（官方 0.2.0-rc.2）：
  - 植入未声明幽灵 → apply+3ms 清除；植入已声明副本 → boot 清单+目录清除；
  - 安装 5 项关键 id：4 项按预期跳过（含原因文案），compact 落地 1.0.1 enabled；
  - enable 守卫：easy-setup / side-session / client-ui-custom 均 409；
  - 硬钉：side-session 手工加回 bundles → 启动干净（无新 crash log）；
  - UI 截图：v0.2.1 + 「内核自带」绿徽章（锁定）+「仅 EAC 内核」红徽章（锁定）；
  - 全程无新增 crash log；结束状态：compact 1.0.1 enabled、无 plugin-manager/terminal/easy-setup/side-session 残留、pm 正常绑定。

## 发布

- `dsh-plugin-suite` **0.2.1**（Release 资产）；channel **v13**：compact 1.0.1（新 sha）、side-session/easy-setup/plugin-manager 重打包产物（硬钉/exports 修复，同版本换内容）、suite 0.2.1 自更新项。
- 已装 0.2.0 的用户：渠道自动更新会把 compact 升到 1.0.1（修复挂载）；suite 本体经「检查更新」升 0.2.1 后获得全部守卫与自愈。受缺陷 2 影响的机器装上 0.2.1 后**启动即自动清除幽灵，无需手工删除**。
