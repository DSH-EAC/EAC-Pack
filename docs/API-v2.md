# API-v2 契约（v0.2.0「完全体」）

> 本文件是 v0.2.0 三条工作线（资产线 / 前端线 / 主线）的接口契约，**字段名与语义冻结**，实现期间只增不改。
> 文件所有权：见 §8。

## 1. 渠道 channel.json（发布在仓库 `channel/channel.json`）

宿主按 §5 的 URL 顺序探测拉取。发布脚本每次发布 `channelVersion` 递增 +1。

```json
{
  "channelVersion": 2,
  "suiteVersion": "0.2.0",
  "generatedAt": "2026-10-01T12:00:00.000Z",
  "notesZh": "本次更新说明（中文，可含换行）",
  "notesEn": "Release notes (English)",
  "items": [
    {
      "id": "balance",
      "name": "@deepseek-ai/dsh-balance",
      "version": "0.1.0",
      "packs": ["aio", "eac"],
      "file": "@deepseek-ai_dsh-balance-0.1.0.tgz",
      "sha256": "<64hex>",
      "bytes": 7425,
      "source": "eac-tag"
    }
  ],
  "suite": {
    "version": "0.2.0",
    "file": "eac-plugin-suite-0.2.0.tgz",
    "sha256": "<64hex>",
    "bytes": 123456
  }
}
```

- `items` = `dist/index.json` 条目超集（同字段，不减少），可附加字段但不得改名。
- `file` 仅文件名；下载 URL 模板：
  - 直连：`https://github.com/DSH-EAC/EAC-Pack/releases/download/channel/<file>`
  - 镜像：`<mirror>/https://github.com/DSH-EAC/EAC-Pack/releases/download/channel/<file>`（mirror 为用户配置的 gh-proxy 风格前缀，可带或不带尾斜杠）
- 渠道索引 URL 探测顺序（首个成功者生效）：
  1. `https://cdn.jsdelivr.net/gh/DSH-EAC/EAC-Pack@main/channel/channel.json`
  2. `https://raw.githubusercontent.com/DSH-EAC/EAC-Pack/main/channel/channel.json`
  3. 若配置了 mirror：`<mirror>/https://raw.githubusercontent.com/DSH-EAC/EAC-Pack/main/channel/channel.json`

## 2. 皮肤馆 gallery.json（随包 `suite/assets/gallery.json`，sync-assets 生成）

```json
{
  "generatedAt": "2026-10-01T12:00:00.000Z",
  "skins": [
    {
      "id": "miku",
      "name": "初音未来 · 电子歌姬",
      "nameEn": "Hatsune Miku",
      "author": "涂山苏苏",
      "tags": ["dreamskin", "vocaloid"],
      "license": "BSD-3-Clause",
      "origin": "builtin",
      "pkgName": "@linxin666/dsh-client-ui-skin-miku",
      "pkgVersion": "0.1.11",
      "previews": { "light": "previews/miku/light.png", "dark": "previews/miku/dark.png" },
      "prompt": "prompts/miku/prompt.md",
      "mutexZh": null,
      "mutexEn": null,
      "notesZh": "…",
      "notesEn": "…"
    }
  ]
}
```

- `origin`: `"builtin"`（10 内置）| `"community"`（6 社区）。
- `previews.*` / `prompt` 为**相对 suite 包根**路径；缺失则该键为 `null`（前端必须容错渲染占位图）。
- `previews.*` 相对键不带 `assets/` 前缀（前端拼 `/api/eac-plugin-suite/asset/<路径>`）。
- `mutex*`：互斥/注意事项文案（如 maid-atelier 与 manager 互斥），无则 null。

## 3. 本地配置 `~/.dsh/eac-plugin-suite/config.json`

```json
{
  "autoUpdate": true,
  "autoUpdateHeavy": false,
  "mirror": null,
  "intervalHours": 6,
  "lastCheckedAt": "2026-10-01T12:00:00.000Z",
  "channelState": "online",
  "channel": { "channelVersion": 2, "generatedAt": "…", "notesZh": "…", "notesEn": "…" }
}
```

宿主启动若无配置文件则用默认值创建。`channelState`: `online | offline | checking | never`。

## 4. HTTP API（全部挂 `/api/eac-plugin-suite`，与 v1 共存）

### 渠道

| 方法 | 路径 | 请求体 | 响应 |
| --- | --- | --- | --- |
| GET | `/channel/status` | – | 见下 |
| POST | `/channel/check` | – | 同 status（同步完成探测后返回） |
| POST | `/channel/config` | `{ autoUpdate?, autoUpdateHeavy?, mirror?, intervalHours? }` | 保存后的完整 config |
| POST | `/channel/apply` | `{ ids: string[], includeHeavy?: boolean }` | `{ jobId }`（复用现有 job 队列，SSE 汇报） |

`GET /channel/status` 响应：

```json
{
  "state": "online",
  "autoUpdate": true,
  "autoUpdateHeavy": false,
  "mirror": null,
  "intervalHours": 6,
  "lastCheckedAt": "…",
  "nextCheckAt": "…",
  "channelVersion": 2,
  "channelGeneratedAt": "…",
  "notesZh": "…", "notesEn": "…",
  "updates": [
    { "id": "miku", "name": "@linxin666/dsh-client-ui-skin-miku", "installedVersion": "0.1.11", "channelVersion": "0.2.0", "tier": "visual", "packs": ["skins"], "installed": true, "titleZh": "…", "titleEn": "…" }
  ],
  "suiteUpdate": { "version": "0.2.1", "file": "eac-plugin-suite-0.2.1.tgz", "sha256": "…", "downloadUrl": "…" },
  "error": null
}
```

- `updates`：渠道版本 > 内置 catalog 版本且（`installed` 为 true 或用户未装）的**全部**可更新条目；`installed` 标记该条目当前 profile 是否已装（供 UI 分组「已装可更新 / 未装新版」）。
- `suiteUpdate`：渠道 `suite.version` > 本包版本时给出（**只提示不自装**），downloadUrl 按下载模板生成。

### 皮肤馆

| 方法 | 路径 | 响应 |
| --- | --- | --- |
| GET | `/skins/gallery` | gallery.json 原文（内存缓存） |
| GET | `/asset/previews/<id>/<theme>.png` | PNG 文件流（theme ∈ light/dark；404 = 无预览图） |
| GET | `/prompts` | `[{ id, name, hasPrompt }]` |
| GET | `/prompts/<id>` | `{ id, manifest: <manifest.json 原文或 null>, prompt: "<prompt.md 全文或 null>" }` |

### 语义约定

- 所有响应 `application/json; charset=utf-8`（PNG 除外）；错误统一 `{ error: "<message>" }` + 合适状态码。
- `/channel/apply` 的 job：每条目 = 下载（如需）→ sha256 → `installBundle(file:<cache 路径>)`；事件走现有 `step-*`；新增事件见 §6。
- 下载缓存目录：`~/.dsh/eac-plugin-suite/cache/`；同名文件已存在且 sha256 匹配则跳过下载。

## 5. 宿主 updater 行为

- 探测超时 8s/源，失败静默降级（state=offline，不弹错）。
- 自动更新触发：宿主启动 60s 后首查 + 每 `intervalHours` 小时 + `POST /channel/check`。
- 自动更新范围：仅 `installed === true` 的条目；`tier === "heavy"` 需 `autoUpdateHeavy: true`。
- 快照/装后 listBundles 核对/manifest 重试/pendingBuilds 处理：全部沿用现有 job 引擎，不另起炉灶。

## 6. SSE 事件（现有 `/events` 流上新增）

| 事件 | data |
| --- | --- |
| `channel` | `{ state, channelVersion }` |
| `download-progress` | `{ id, received, total, percent }`（total 可能未知 = -1） |

既有 `step-start/ok/warn/fail`、`job-*`（如有）保持不变。

## 7. 前端设计规范（Agent B 必读）

- 技术约束不变：手写 `window.__ModuleLoader__.load({ id, factory: require => … })` 工厂包；只 `require('react')` 用 `createElement`；CSS 为组件内 `<style>` 模板字符串；**零构建**。
- 主题：颜色一律 `var(--dsw-alias-*)`（bg-layer-1/2/3、border-l1/l2、label-primary/secondary/tertiary、label-on-accent、state-business/success/warning/error-primary）。
- 动效：仅 transform/opacity；入场 stagger 240ms `cubic-bezier(0.16,1,0.3,1)`、级差 120ms；数字 count-up 用 rAF；完成态 SVG ✓ 用 stroke-dashoffset draw；`@media (prefers-reduced-motion: reduce)` 下动画时长归 0.01ms。
- 信息架构：顶栏（标题+渠道状态 pill+检查更新按钮）→ segmented 子导航（概览/皮肤馆/插件管理/更新中心，滑动指示条）→ 四区内容。状态机 loading/ready/error 保留，SSE 进度面板保留并升级。
- i18n：`suite/locale/{zh,en}.json` 增补新键（皮肤馆/更新中心/渠道状态全部双语），`DICT` 同步。

## 8. 文件所有权（避免并发冲突）

| 线 | 可写文件 | 禁改 |
| --- | --- | --- |
| 主线 | `suite/index.js`、`suite/test/host.test.mjs`、`docs/API-v2.md` | client.js、dev/、locale/、catalog/、scripts/ |
| 资产线 A | `catalog/*`、`scripts/repack/*`、`scripts/fetch-assets.mjs`、`scripts/publish-channel.mjs`、`suite/scripts/sync-assets.mjs`、`suite/assets/**`（产物）、`docs/DISTRIBUTION.md` | index.js、client.js、dev/、locale/ |
| 前端线 B | `suite/client.js`、`suite/dev/**`、`suite/locale/*.json` | index.js、catalog/、scripts/、assets/（mock 预览图放 dev/ 内） |

集成期（M5）由主线统一跑 sync-assets / npm pack / verify。

## 完整安装资源校验（eac-plugin-suite 0.2.2）

API 前缀 /api/eac-plugin-suite。GET /status 的 resources 以及 SSE type: resources 事件报告本地资源校验状态：

```json
{"state":"checking","mode":"installed","resourceVersion":"0.2.2","total":72,"completed":18,"totalBytes":302031150,"completedBytes":50000000,"receivedBytes":50000000,"active":[],"error":null}
```

状态为 idle | checking | ready | failed | cancelled；没有 downloading。completed 只计校验通过的本地文件，receivedBytes 为兼容显示字段，等于 completedBytes，并非网络下载流量；active 恒为空。

POST /resources/retry 仅启动/复用本地重新校验，返回 202；服务未初始化为 409。不下载、不修复文件。缺失或损坏请重新安装完整包。

普通安装只接受随包固定的版本、大小、摘要；大文件用随包分块本地拼接，并检查完整摘要，安装前重新校验并保存至持久化目录。不得用旧缓存遮蔽本次安装缺失，或者降级到上游/latest。禁用插件中止校验。在线渠道下载更新行为不变。

## 0.2.3 资源位置变更说明（2026-10-05）

现有 `/api/eac-plugin-suite` API 路径与字段不变，resources.mode 仍为 installed：表示本地资源已由安装事务提供，不表示资源物理位于 Git 入口中。Git 使用精确必选 registry 资源依赖，完整 Release 内置同一依赖；启动和 retry 均只进行本地校验。gallery、preview 与 Prompt 在返回前校验固定摘要，preview 保持 `/asset/previews/<id>/<light|dark>.png` 路径。发布状态与本轮验收见 `CASCADE-INSTALL-TEST-2026-10-05.md`。
