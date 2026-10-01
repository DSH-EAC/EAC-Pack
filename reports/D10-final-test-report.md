# D10 真机实测报告 — v0.2.0「完全体」

- 日期：2026-10-01
- 宿主：官方 DeepSeek Harness 桌面端 **v0.2.0-rc.2**（`D:\deepseek官方桌面端`）
- 被测：`dsh-plugin-suite` **0.2.0**（在线渠道 + 皮肤馆 + AIO 现代化）
- 方式：CDP（9222）驱动真机 + 同源 API（与 UI 同一路径）+ 官方「添加插件」对话框
- 关联：[D10-test-plan.md](./D10-test-plan.md) · [D9 报告](./D9-final-test-report.md)

## 1. 部署（A 场景）

| 项 | 结果 |
| --- | --- |
| 官方插件页「添加插件」本地目录安装 0.2.0 | ✅（以 `link:` 依赖装入 profile；中文路径目录会令 pnpm ENOENT，需 ASCII 路径） |
| 升级覆盖 | ❌ 官方安装器拒绝覆盖已装插件 → 先卸载旧版再装（对话框原文提示） |
| 重启后 | ✅ ver 0.2.0，skins 15，EAC 48，AIO 17（本版退役 2 项后），bundles 84 |

**部署踩坑（重要）**：卸载整合包本体后，profile 里 69 个 `file:` 依赖仍指向 `node_modules/dsh-plugin-suite/assets/dist/*.tgz`——该目录随本体消失，任何后续 pnpm 操作都 ENOENT。恢复手法：把新版解包目录放回 `node_modules/dsh-plugin-suite` + 从 profile 清单摘除已不存在的依赖行。

## 2. 在线渠道（C 场景）— 全链路真机 ✅

| # | 场景 | 结果 |
| --- | --- | --- |
| C1 | 启动 60s 自动探测 | ✅ `channel-probe online v3 via cdn.jsdelivr.net`（raw 源本机 TLS 被拦，jsDelivr 已调为主源） |
| C2 | 渠道 v5（blue-fantasy 0.1.11→0.2.0）→ 自动识别 | ✅ `auto-update channel v5: …blue-fantasy job=chan-…` |
| C3 | 下载→sha256→安装→状态保持 | ✅ ghproxy.net 镜像下载 5,312,560 字节（7s）→ sha256 校验 → installBundle → **禁用状态保持**（enabled=false 未被翻转） |
| C4 | 全自动（零人工） | ✅ 探测→识别→下载→安装全程无交互；`done ok=1 failed=0` |
| C5 | 离线降级 | ✅ 全源失败时 state=offline，UI 灰点不报错 |
| C6 | 镜像配置 | ✅ `POST /channel/config {mirror}` 持久化；直连 github release 资产 TLS 失败时镜像成功（ghproxy.net ✅ / gh-proxy.com 429 / ghfast.top 超时） |
| C7 | 渠道 v7 12 项批量自动更新（AIO 现代化） | ✅ 见 §5 |

**渠道资产分发**：channel.json 走 jsDelivr + raw 双源（jsDelivr 有分钟级缓存，发布后需 `purge.jsdelivr.net` 清一次）；tgz 走 GitHub Release `channel` tag（75 资产）+ 用户可配置镜像前缀。

## 3. 皮肤（D 场景）

- 离线安装 6 社区皮肤 ✅ 6/6（job 0 失败，快照自动）
- 皮肤馆 API：gallery 15 套、预览图 PNG 200（离线）、prompt 10 套 ✅
- miku 换肤回归 ✅；endfield 换肤 ✅（真机截图 d10-skin-*.png）

### 3.1 RC2 适配逐款扫查（13 款换肤皮肤，启用前断言单皮肤生效）

| 皮肤 | 适配状态 |
| --- | --- |
| miku / dragon-heir / minecraft / xp / trading / whale-song / **orca-link**(社区) | ✅ 良好，无错位 |
| qq98 | ⚠️ 蓝底次要文字对比度低 |
| **liang**(社区) | ⚠️ 新会话按钮灰底灰字 |
| blue-fantasy | ⚠️ 侧栏装饰气泡遮挡会话文字 |
| **deep-whale-day-night**(社区) | ⚠️ 侧栏装饰遮挡（同 blue-fantasy 装饰系） |
| endfield(社区) | ⚠️ status-rotator 指示器错位到左上（建议同用时禁用该插件） |
| ths | ❌ 侧栏文字几乎不可见 |
| **maid-atelier**(社区) | 💥 **启用即崩**（渲染进程崩溃循环、主进程膨胀 5.3GB、CDP 失联）——图鉴已锁启用按钮并标注 |

根因：皮肤普遍面向 AIO/EAC 分叉版 Web UI 制作，官方 RC2 DOM 漂移使装饰层选择器打偏——**上游适配问题，非安装机制问题**。全部逐款结论已写入图鉴「RC2 适配状态」区（compatZh/compatEn）。

**内核清单脱钩发现**：崩溃期间启用态在 `dsh.profile.bundles`（分层清单）与 listBundles 间脱钩——API 显示禁用但 client 仍被加载，需从 profile package.json 手工摘行 + `pnpm install` 调和才能恢复。已知问题，报告内核侧。

## 4. UI 翻新（E/F 场景）

- 四区子导航（概览/皮肤馆/插件管理/更新中心）真机渲染 ✅，明暗主题 ✅，中英双语 ✅（d10-ui-*.png，视觉评审 agent 结论 6 pass / 3 must-fix）
- 评审 must-fix 处置：
  1. **抽屉透底** → `backdrop-filter: blur(30px)` 复验 ✅
  2. **EN 预览图未载** → 复验为截图时机（桥接单图 ~5s），等待后 30/30 全载 ✅
  3. **endfield 状态指示器错位** → 上游皮肤与 status-rotator 冲突，已写入图鉴适配备注（非整合包代码缺陷）
- 本版修复的隐藏硬伤：**dsh-app fetch 桥只认 `res.end` 捕获 body**——PNG 预览必须缓冲后单次 end（流式管道到不了浏览器端）；`<img src>` 不走同源代理，改 fetch→blob→objectURL。

## 5. AIO 现代化（用户需求，上游普查驱动）✅

子智能体普查（28 npm 包 + 30 仓库）后执行：

**直升 13 项**（渠道 v7，真机自动更新逐项验证中）：
picturereader 3.3.1→**3.3.3**（⚠️ 旧版在 RC2 有拖垮插件树风险，最高优先）、soul-md 0.2.8→**0.9.0**（RC2 原生）、unified-market 0.3.1→**0.4.1**（修精选目录塌缩）、meme 0.1.39→**0.1.44**、status-rotator 0.9.1→**0.33.1**、find-plugin 0.3.7→**0.4.0**、meow-smooth 0.5.0→**0.8.1**、web-mobile-fix 1.0.1→**1.0.6**、navbar 0.3.0→**0.4.0**、dafeiyu α.6→**0.1.14**、pet 0.1.3→**0.3.1**（RC2 原生）、whale-widget 0.2.10→**0.3.17**、computer-user 0.3.6→**0.3.7**

**退役 2 项**（AIO 包 19→17）：`@dsh-external/dsh-webui` + `@local/dsh-webui-statem-bridge`——上游仓库 404（gh api 实查）、RC2 上阻塞 web boot、后者为 UNLICENSED 私有构建（分发风险最高项随之解除）。`aio-ui-compat`/`client-ui-custom` 保留（client-ui-custom 社区续作 yoli-mi rc.7 暂未适配 RC2，观望）。

**维持锁定**：wallpaper-engine 1.1.0 / session-manager 0.5.4 / undo-savepoint 0.4.9（跨度大，待下版冒烟）、better-sidebar 0.24.1 与 agent-teams 0.1.22（上游无 EAC 适配预发布）、visualize 0.1.4（HEAD 即锁版，上游已显式接受 dsh 0.2）、deep-whale-day-night（上游标注「最终发行版」）。

**观察项**：EAC 官方已发 `@dsh-eac/desktop-pack` v1.1.0（RC2 官方整合包）与 v6.0.0-beta.1——自建包差异化空间收窄；皮肤正被官方 `dsh-ui-skin-loader` 公约收编。下版评估分工。

## 6. 回归与工程

- 单测：node --test **11/11**（渠道引擎 8 项 + 存量 3 项）✅
- verify.mjs：72 tgz 全合格（peer 满足 0.2.0-rc.2）✅
- 快照：每次 job 自动 ✅（~/.dsh/plugin-suite/snapshots）
- 构建修复：repack 增加孤儿清理（旧版 tgz 曾致 suite 自引用打包膨胀至 601MB）
- 发布产物：suite 0.2.0 tgz（含全部 UI/宿主修复与现代化 catalog）+ channel v7 + GitHub Release v0.2.0

## 7. 遗留问题

1. **pnpm 分层与 listBundles 脱钩**（崩溃残留）：需手工摘 profile 清单行恢复——建议内核侧排查。
2. suite 本体自更新仍为「提示+下载」不自装；官方安装器不支持覆盖升级。
3. 皮肤上游适配（blue-fantasy 系装饰遮挡、ths 文字不可见、maid-atelier 崩溃）需等上游；图鉴已如实标注。
4. jsDelivr 分支缓存（分钟级）发布后需手动 purge；脚本可考虑自动 purge。
5. 「验证后直升」四项（wallpaper-engine 1.1.0 / session-manager 0.5.4 / undo-savepoint 0.4.9 / file-drop-eac 0.1.2）留下版。

## 截图索引

d10-deploy-01/02 安装失败与详情 · d10-ui-overview/gallery/drawer/plugins/updates-zh-light · d10-ui-gallery-zh-dark · d10-ui-gallery-en-light · d10-skin-{miku,endfield,blue-fantasy,dragon-heir,minecraft,qq98,xp,ths,trading,whale-song,orca-link,liang,deep-whale-day-night}.png
