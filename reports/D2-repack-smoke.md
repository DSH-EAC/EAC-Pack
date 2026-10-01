# D2 — 重打包产物与 CLI 冒烟报告

日期：2026-10-01 ｜ 环境：Windows 11 (22000) ｜ node v24.11.1 / pnpm 11.7.0 / npm 11.6.2 / git 2.54.0 / **dsh 0.2.0-rc.2**

## 1. 产物统计（dist/）

| 项 | 数值 |
| --- | --- |
| tgz 总数 | **69**（唯一包名级；77 条 catalog 条目去重 8 条共享镜像后） |
| —— EAC 包（catalog/eac.json 48 项） | 48（36 eac-tag 重打包 + 11 npm 重打包 + 1 github 重打包） |
| —— AIO 独有（catalog/aio.json 19 条中 11 项新增） | 11（aio-ui-compat、auto-compact、webui、visualize、client-ui-custom、webui-statem-bridge、drag-and-drop、find-plugin、meme、wallpaper-engine、status-rotator） |
| —— 皮肤（catalog/skins.json 10 项） | 10（9 npm + 1 eac-tag maid-atelier） |
| index.json | 69 条：`{id,name,version,packs,file,sha256,bytes,source}`，按 name 排序 |
| SHA256SUMS | 69 行，`sha256sum -c` 兼容（哈希 + 双空格 + 文件名） |
| unavailable 项 | 0（offpeak 9.9.9 经 eac-tag 可得，无不可得项） |
| 体积区间 | 4.3KB（eac-core-bridge）～ 9.1MB（raw-html 内置字体）；better-sidebar 2.4MB（codemirror/xterm 内嵌） |

`node scripts/repack/verify.mjs` 结果：**PASS（69 个 tgz 全部合格）**

- (a) index.json ↔ catalog 一一对应（含共享条目 packs 并集校验：8 条 `["eac","aio"]`）；
- (b) 每个 tgz 的 sha256/bytes 与文件实况一致，tgz 内 package.json 的 name/version 与条目一致；
- (c) peer 校验（semver@7，`includePrerelease:true`，即官方"prereleases participate in range matching"语义）：
  - `@deepseek-ai/dsh` peer（若有）对 **0.2.0-rc.2** 满足；
  - 其余 `@deepseek-ai/*` peer 均为放宽形态（`>=floor` / `*`）且 floor 保留在范围内；
- (d) SHA256SUMS 与 index.json 一致；安装脚本（preinstall/install/postinstall）0 例（prepack/prepare 类已在重打包时剥离）。

### package.json 改写实绩（重打包日志摘录）

- `dsh-pet`：剥离 `prepack`（staging 无构建源，npm pack 会失败——首跑实测）。
- `picturereader`：`@deepseek-ai/dsh-settings: "^0.1.0-rc.6 || ^0.1.1-rc.2" -> ">=0.1.0-rc.6"`、`@deepseek-ai/schemastery: "^3.18.1" -> ">=3.18.1"` 等。
- `dsh-better-sidebar`：15 个 `^0.1.0-rc.8` 内部件 peer 全部放宽为 `>=`，`@deepseek-ai/cordis ^4.0.1 -> >=4.0.1`。
- `@dsh-external/dsh-webui`：28 个 peer（原精确 pin `0.1.3-alpha.2`）全部放宽。
- `@dsh-external/dsh-client-ui-skin-maid-atelier`：`files+= LICENSE, NOTICE`（CC-BY-NC-SA 署名文件保住）。
- `dsh-raw-html`、`meow-smooth`、`dsh-web-mobile-fix` 等：`files+= LICENSE`。
- 非 `@deepseek-ai` 作用域 peer（react/react-dom/zod/cordis）保持原样（抽查 think-zh 的 `cordis@^4.0.0-rc.8` 未动）。

## 2. CLI 冒烟（suite-smoke profile）

前提：**未触碰 `~/.dsh/profiles/desktop`**；新 profile 由 `dsh plugin --profile suite-smoke` 自动初始化（package.json 空依赖 + `dsh.profile.bundles: ["@deepseek-ai/dsh-base"]` + pnpm-workspace.yaml `nodeLinker: hoisted` / `autoInstallPeers: false`，无 allowBuilds 键）。

### ① npm 直装类：`dsh plugin --profile suite-smoke add dsh-whale-widget@0.2.10`

```
dependencies:
+ dsh-whale-widget 0.2.10
Packages: +1 ... Done in 975ms using pnpm v11.7.0    EXIT=0
```

- peer 预检：无警告（该包无 peerDependencies）。
- package.json 变化：`dependencies["dsh-whale-widget"]="0.2.10"`；**`dsh.profile.bundles` 自动追加 `dsh-whale-widget`**。

### ② 重打包 tgz 类：`add D:\...\dist\dsh-viewport-lock-1.0.1.tgz`（绝对路径 file 协议）

```
✓ Lockfile passes supply-chain policies (verified 17s ago)
dependencies:
+ dsh-viewport-lock file:D:/丰富履历专用文件夹/插件包/dist/dsh-viewport-lock-1.0.1.tgz
dsh: warning: dsh-viewport-lock declares no dsh.bundle — installed as a plain dependency, not a profile layer
Done in 727ms    EXIT=0
```

- peer 预检：无警告（该包无 peer）。
- 关键情报：`dsh plugin add` 读取包内 `package.json` 的 **`dsh.bundle` 字段**判定层级——有 `dsh.bundle.patch`（如 whale-widget、our-free-model）→ 自动写入 `dsh.profile.bundles`；无（如 viewport-lock 仅有 `dsh.client`）→ 普通依赖 + warning。Host 生成 profile 时对 bundle 型插件可依赖该自动化，patch 型（非 bundle）插件需自行写 cordis.patch.yml 行。

### ③ git 类：`add git+https://github.com/zouyuxuan122/dsh-our-free-model.git`

```
dependencies:
+ dsh-our-free-model git+https://github.com/zouyuxuan122/dsh-our-free-model.git
Packages: +1 ... Done in 7.2s    EXIT=0
```

- 链路验证：git clone → lockfile 锚定 commit `98842df1` → 装出 **1.3.1**（与用户 desktop profile 现装版本一致，未触碰 desktop）。
- 自动加入 `dsh.profile.bundles`（该包声明 `dsh.bundle.patch`）。

### 冒烟后 profile 终态（~/.dsh/profiles/suite-smoke/package.json）

```json
{
  "dependencies": {
    "dsh-our-free-model": "git+https://github.com/zouyuxuan122/dsh-our-free-model.git",
    "dsh-viewport-lock": "file:D:/丰富履历专用文件夹/插件包/dist/dsh-viewport-lock-1.0.1.tgz",
    "dsh-whale-widget": "0.2.10"
  },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "dsh-whale-widget", "dsh-our-free-model"] } }
}
```

`node_modules/`：dsh-our-free-model、dsh-viewport-lock、dsh-whale-widget 三包齐；`pnpm-lock.yaml` 正常生成（git 依赖锚 commit，file 依赖记绝对路径）；`.modules.yaml` 显示 **`pendingBuilds: []`**。

### pendingBuilds / allowBuilds

三个冒烟包均无 install 生命周期脚本，未触发构建审批，`pendingBuilds: []`，**无需加 allowBuilds 键**。重打包管线已系统性剥离全部 preinstall/install/postinstall（dist 69 包 0 例，verify 覆盖），后续安装 dist 内任何 tgz 预计同样不触发。若未来引入带原生构建的包，处理位点是 profile 的 `pnpm-workspace.yaml`（加 `allowBuilds` / pnpm 11 的构建审批键，或 `pnpm approve-builds`）。

## 3. 发现的管线级注意点（供 Host 实现）

1. **GNU tar 把 `D:\...` 的盘符冒号解析为远程主机语法** → 脚本内 tar 一律 cwd + 相对路径调用；npm pack 产物定位用 `--json` 的 filename 字段。
2. **Windows `fs.rmSync` recursive 会【静默失败】**：实测对刚写完的 staging 树报"成功"但目录仍在（空目录+普通文件都删不掉，无异常抛出），且 `fs.cpSync` 覆盖复制另有 errno=0 unlink 怪癖。早期 run 的 staging 残留导致部分 tgz 混入 stale 文件偏大（如 computer-user 138KB → 洁净后 40KB）。**最终 rmRf 采用"改名挪走 + `cmd rd /s /q`"兜底，洁净房间重跑 69 项后 staging 0 残留**；dist 现有产物全部来自洁净重跑。
3. npm 包的 `prepack`/`prepare` 在"提取物 staging"上会失败（构建源不在发布物内，实测 dsh-pet/prepack、dsh-find-plugin/prepack、wallpaper-engine/prepare、agent-teams/undo-savepoint/visualize 的 prepublishOnly）→ 统一剥离生命周期脚本，同时消除了 pnpm pendingBuilds 来源。
4. tgz 安装时 pnpm 把 **绝对 file: 路径**写进 profile package.json/lockfile；整合包 Host 半解析 catalog 的 `file:dist/...` 为绝对路径后即为此形态，属预期。
5. `dsh plugin add` 的 bundle 自动登记规则（见 ②）与 `cordis.patch.yml` 空模板初始化（`[]`）已验证，Host 据此编排 EAC 48 项的启用/禁用行。

## 4. 复现命令

```bash
node scripts/repack/repack.mjs      # 全量重打包（幂等，npm tarball 缓存 .cache/npm-tarballs）
node scripts/repack/verify.mjs      # 产物校验（当前 PASS）
# 冒烟（隔离 profile，勿用 desktop）：
dsh plugin --profile suite-smoke add dsh-whale-widget@0.2.10
dsh plugin --profile suite-smoke add <整合包根>/dist/dsh-viewport-lock-1.0.1.tgz
dsh plugin --profile suite-smoke add git+https://github.com/zouyuxuan122/dsh-our-free-model.git
```

## 5. 遗留问题

1. 冒烟未覆盖 peer 冲突路径（三个样本均无 peer 或 peer 已满足）——`autoInstallPeers: false` 下未满足 peer 在 pnpm 侧为 warning 不阻断；`@dsh-external/dsh-webui`（28 个放宽 peer）全量装 AIO profile 的效果建议 Host 在专用 profile 试装验证。
2. git 类依赖 lockfile 锚定当前 HEAD commit；上游 `dsh-our-free-model` 发新版本不会自动跟随（整合包可复现性优先，属预期取舍）。
3. offpeak dist 文件名带占位版本 9.9.9（见 D1 报告 §7）。
4. `dsh plugin add` 尚无"从 catalog 批量安装"命令，批量编排逻辑由整合包 Host 承担（逐项 `add` 或生成 profile package.json 后 `dsh plugin install`，后者未在本轮冒烟范围）。
