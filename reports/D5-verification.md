# D5 真机验证报告 — 整合包插件在官方桌面端全链路打通

- 日期：2026-10-01
- 被测件：`dsh-plugin-suite` 0.1.0 → 0.1.1
- 宿主：官方 DeepSeek Harness 桌面端 **v0.2.0-rc.2**（`D:\deepseek官方桌面端`，preview 构建于 2026-09-29）
- 目标 profile：`~/.dsh/profiles/desktop`（安装前已快照至 `.cache/backup-desktop-profile/`）

## 验证结论：通过 ✅

| # | 验证项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 官方插件页安装对话框接受本地 tgz spec | ✅ | profile package.json 出现 `dsh-plugin-suite: file:...tgz` |
| 2 | 安装后出现在「已安装」列表，中文标题/描述/图标生效 | ✅ | d5-02-installed.png（locale/zh.json + icon.svg） |
| 3 | 设置 → 内置插件 出现「整合包」tab（`settings.plugins.tab`） | ✅ | d5-03-builtin-plugins.png、d5-04-tab-live.png |
| 4 | client 半 React 组件渲染（错误态/空态/就绪态） | ✅ | 同上 |
| 5 | 宿主半惰性绑定 `pluginManager` 服务 | ✅ | trace.log: `pluginManager resolved` |
| 6 | 宿主半挂载 `/api/plugin-suite`（webServer prefix） | ✅ | trace.log: `webServer mounted` |
| 7 | client→host same-origin fetch 取到真实数据 | ✅ | /status 返回 suiteVersion + listBundles 真实 bundle（@deepseek-ai/dsh-base 0.2.0-rc.2 等） |
| 8 | 版本替换安装（0.1.0 → 0.1.1） | ✅ | 插件页重复安装成功，依赖记录更新 |

## 关键发现（工程决策依据）

1. **`settings.plugins.tab` 槽位在 RC2 存在且可用**，注册即出现在「内置插件」区 tab 行，且默认选中我们的 tab（order: 5）。
2. **client 半是手写 ModuleLoader 工厂包**（`window.__ModuleLoader__.load({id, factory})`），无需复刻官方 tsdown 构建链——同机 `dsh-our-free-model` 即此格式。
3. **宿主半顶层 `inject = ['pluginManager']` 会导致插件启动失败**（0.1.0 的 404 根因）：服务在插件启动时刻未必就绪。修复 = `inject = []` + apply 内 `ctx.inject(['pluginManager'], …)` 惰性绑定 + trace 落盘。**这是所有外部插件的通用教训。**
4. 同源 fetch 走 `dsh-app://app/api/*` 自定义协议转发到 webServer，prefix 路由 `{kind:'prefix', path:'/api/<name>'}` 与内核 RPC 同源可用。
5. 安装到 desktop profile 的唯一官方通道是桌面端自身的插件页（CLI 硬拒 `--profile desktop`）；整合包在运行时通过 `pluginManager` 服务装插件属于同一条被授权的服务路径。
6. 单测曾把事件写进真实 `~/.dsh/plugin-suite/`（DATA_DIR 模块顶层固化）——已改为调用时惰性解析，测试与真实环境隔离。

## 遗留 / 风险

- 目录数据为空（D1/D2 资产线产出后同步进包）。
- `installBundle` 的 `approvedBuilds`/`setVersionExemption` 形参按文档推断，D8 实测校准。
- 皮肤/外观类插件在 RC2 上的实际表现需 D8 逐项矩阵验证。

## 截图

- d5-01-launch.png 官方端启动基线
- d5-02-installed.png 安装成功（已安装 2）
- d5-03-builtin-plugins.png 整合包 tab 首次出现（404 错误态，client 渲染正常）
- d5-04-tab-live.png 修复后：套餐卡/工具栏/进度面板完整渲染，v0.1.1 真实数据
