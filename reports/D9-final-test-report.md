# D8/D9 真机实测报告 — EAC/AIO 全量插件在官方 RC2 桌面端

- 日期：2026-10-01
- 宿主：官方 DeepSeek Harness 桌面端 **v0.2.0-rc.2**（`D:\deepseek官方桌面端`）
- 整合包：`dsh-plugin-suite` **0.1.6**（profile 内 `file:` 依赖，随包内置 69 个重打包 tarball，离线可装）
- 方式：整合包 UI（设置 → 内置插件 → 整合包）与同源 API（与 UI 同一路径）批量安装

## 最终状态（重启后持久验证 ✅）

| 套餐 | 已装/总数 | 启用 | 按设计禁用 | 内核自带跳过 |
|---|---|---|---|---|
| EAC 全量包 | **46/48** | 41 | 5 | 2 |
| AIO 精选包 | **18/19** | 15 | 3 | 1 |
| 皮肤（可选） | 10/10 | 0（默认全关） | — | — |

- EAC 禁用 5 项（全部预期）：`easy-setup`、`side-session`（RC2 缺 settingsScope 服务，阻塞 boot）、`pet`、`whale-widget`、`image-paste`（EAC 自身默认值）
- AIO 禁用 3 项（全部预期）：`webui`、`client-ui-custom`（同 settingsScope）、`whale-widget`（默认）
- 内核自带跳过 3 项：`terminal`、`plugin-manager`（RC2 内置版本比 EAC 随包 0.1.0 更新）

## 场景实测

| 场景 | 结果 | 说明 |
|---|---|---|
| 批量安装 EAC 全量 | ✅ 48 步 0 失败，约 4 分钟 | better-sidebar 的 node-pty 构建脚本被引擎自动批准 |
| 批量安装 AIO 独有 | ✅ 11 步 0 失败 | 引擎修正 `enabled:false` 语义后按需禁用 |
| 安装 10 款皮肤 | ✅ 10/10 | 默认禁用，按需启用 |
| 更新检测 | ✅ | 目录版本 > 已装版本 → 徽章「可更新 a → b」+「可更新 N」按钮 |
| 更新执行 | ✅ | POST /update → installBundle 原地替换 → 重启生效 |
| 卸载所选 | ✅ | offpeak、think-zh-expand-eac 干净移除（deps+bundles） |
| 重装恢复 | ✅ | 两项重装回到启用状态 |
| 自动快照 | ✅ 7 份 | 每个任务前自动快照 package.json + lockfile |
| 卸载整合包本体 | ✅（机制同 removeBundle） | 已装插件默认保留；"一并移除"= 先在 UI 清选再移除整合包 |
| web boot 兼容门 | ✅ 已绕行 | 见下方兼容性发现 |

## RC2 兼容性发现（D8/D9 核心产出）

1. **settingsScope 服务**（EAC 分叉版专有，官方 RC2 不提供）：`easy-setup`、`side-session`、`@dsh-external/dsh-webui`、`@ha-na-bi/dsh-client-ui-custom` 四个插件启用后 **web boot 直接拒绝启动**（`entries did not activate`），官方崩溃门提供"禁用第三方插件"整体恢复按钮。整合包方案：目录标记 `defaultEnabled:false` + 界面标注原因，用户可在了解风险后手动启用。
2. **非 bundle 包安装语义**：内核 JSDoc 明确"无 bundle patch 的包安装后还原 manifest"。重打包管线为此给 26 个纯插件生成了自引用 `cordis.patch.yml`（模式同 dsh-our-free-model），使 installBundle 自动分层。
3. **typert strict codec 变更**：`skin-switch` 的 remote face mount 失败（`no create() factory`），其皮肤选择 tab 不可用但**不阻塞**；直接启用皮肤包（如 miku）完全生效——皮肤系统整体可用。
4. **批量安装竞态**：连续 pnpm 操作曾静默丢失一次 manifest 效果（find-plugin）。引擎已加"装后核对 + 自动重试一次"。
5. **磁盘门槛**：C 盘满时官方安装器报"没有写入权限"/"磁盘空间不足"并拒绝安装（清晰的预检）；清理更新缓存后恢复。

## 已验证生效的插件证据（抽样视觉/行为）

- 设置页新增分区 ≥12：增强功能、余额、桌宠、连接手机、Skills 与 MCP、价格设置、插件保护、选择向导、外观·字体与颜色、输入灵动岛、AI 变更审核、快照
- `status-rotator`：加载页趣味状态文案实时轮换（截图 d9-01）
- `miku` 皮肤：整壳换肤成功（标题栏/壁纸/状态栏，截图 d9-02）
- 30 个第三方 client 半注册进 `__DSH_BOOT__`；官方插件页「已安装 48」
- 整合包 UI 五状态（加载/就绪/安装中/失败/空态）真机可用（d8-00 等）

## 已知限制

- `skin-switch` 选择器 tab 在 RC2 不可用（codec 变更）；换肤 = 插件页逐个开关皮肤包
- 4 个 settingsScope 依赖插件默认关闭（启用会阻塞启动，除非上游适配 RC2）
- `offpeak` 为 EAC 随包占位版本（9.9.9），上游 npm 不可得
- `@local/dsh-webui-statem-bridge` 为 AIO 私有构建（UNLICENSED），仅随整合包整体分发

## 截图索引

d8-00 目录 UI · d8-02 安装任务 · d8-04 恢复后 · d8-06 已安装 48 · d8-07 设置分区 · d9-01 状态轮换 · d9-02 miku 皮肤
