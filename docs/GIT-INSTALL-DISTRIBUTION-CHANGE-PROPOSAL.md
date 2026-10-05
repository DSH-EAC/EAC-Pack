# eac-plugin-suite：Git 体积优化与完整级联安装修改建议

- 整理日期：2026-10-05（Asia/Shanghai）。
- 状态：对话归档与实施方案；2026-10-05 已完成本地级联改造与测试 registry / Desktop 验证，生产 npm 发布与 Git 推送仍待发布凭据。
- 原文记录编写时的建议边界；后续用户已授权实现、提交与推送。实际结果以 CASCADE-INSTALL-TEST-2026-10-05.md 为准，不能把下文计划矩阵当成全部已通过。
- 建议目标版本：`0.2.3`，最终版本在实施前确认，不覆盖已交付的固定版本内容。

## 1. 结论与目标

建议将当前“完整资源直接提交 Git”的分发方式，改为 **Git 轻入口 + 必选 registry 资源依赖**：

1. Git 继续提供可被 Desktop 管理的 `eac-plugin-suite` 组合包入口及 host/client。
2. 安装器通过普通 `dependencies` 取得固定版本的 `eac-plugin-suite-assets`。
3. 插件 tarball、皮肤预览、Prompt 进入资源包，不继续进入主 Git。
4. 安装完成时完整基线已落盘；启用后仅本地校验、拼接和读取，不再后台下载基线。
5. 保留单文件完整 Release 安装路径；该产物在发布 staging 中生成，不提交 Git。

这恢复的是“安装阶段级联取得完整资源”的设计思路，**不是原样恢复直接 URL 子依赖，也不是恢复启用后补下载**。registry 包能否在实际 Desktop 默认安全策略下完成级联安装，必须重新实测，不能引用旧直接内置方案的结果代替。

## 2. 本次对话、决策演变与问题归档

### 2.1 原始问题

用户使用 Desktop 输入 `github:DSH-EAC/EAC-Pack`，pnpm 完成包下载后，宿主提示：

> 这个包没有声明组合包，不能作为插件管理

需求不止是“pnpm 能装入一个包”，还包括组合包可管理、Git 入口可获得完整 Release 的资源能力。包名、host/client、API 和文档统一改为 `eac-plugin-suite`，仓库地址保留 `DSH-EAC/EAC-Pack`。

### 2.2 先轻量、启用后补齐

曾实现轻入口加资源下载管理，并在隔离 Desktop 中验证安装、启用、SSE 进度、失败诊断等机制。历史记录见 `LOCAL-INSTALL-TEST-2026-10-04.md`。

用户随后明确要求“一装就装完整”，否决启用后补齐作为最终交付方式。历史方案不能作为当前方案的交付承诺。

### 2.3 直接 tarball URL 资源子依赖

曾尝试用依赖指向完整资源 tarball，但 pnpm 11.7.0 实测返回 `ERR_PNPM_EXOTIC_SUBDEP`。原因为默认 `blockExoticSubdeps` 策略限制传递依赖中的 Git/直接 tarball URL；本地 `file:` 夹具成功不等于远端 URL 可用。

没有关闭安全策略绕过。此次建议改为普通 registry 版本依赖，避免重复走已失败的来源路径。

### 2.4 完整资源直接进入 Git

为满足安装即完整，当前实现直接包含 `suite/assets/payload/`：

- 取得并验证完整源归档，导入 72 个 canonical 资源。
- 修复 25 个子插件缺少组合包声明的问题；47 个原本已带声明。
- 构建出 77 个实际文件；大资源按 40 MiB 分块，不使用 LFS 指针。
- Git 与 Release 直接携带完整资源；无安装时下载脚本。
- 本地真实 Git 安装和 Desktop 官方安装对话框通过，启用后 72/72 就绪。
- 资源管理器全量测试基线 `fetch` 次数为 0，四个代表性子插件安装成功且保持禁用。
- 15 个皮肤条目、30 张明暗预览、10 项 Prompt 可读取。
- 当时 Node 24/25 各通过 41/41 测试。本文不代表再次执行了这些运行测试。

详细证据和边界见 `FULL-GIT-INSTALL-TEST.md`。此结果不证明所有 72 个第三方插件逐个启用后兼容，也不证明其传递依赖完全离线。

### 2.5 提交、推送与体积疑问

本地已有两笔提交：

| 提交 | 内容 |
| --- | --- |
| `b0daf19` | 改名、完整 Git 安装机制、文档、测试 |
| `912edd5` | 72 项基线资源对应的 77 个实际 payload 文件 |

用户授权提交、推送，并计划手动测试远端安装。上传遇到持续低速及请求未完成；助手停止自己的后台推送，交由用户处理。

**2026-10-05 编写本文时重新查询：远端 `main` 为 `15672c64bf02f9a4b4464e2bb57fb7931a968e0b`，本地 HEAD 为 `912edd5c4f15c9b3645a3912b299d4309f76d021`。** 这只是本次查询快照，实施历史调整前必须再次查询，不能假定用户未进行后续推送。

用户怀疑完整 `eac-plugin-suite-0.2.2.tgz` 被误提交。检查确认：该完整安装包未被 Git 跟踪，受 `.gitignore` 排除；大提交来自有意纳入的子插件资源，不是完整安装包被重复提交。

用户进一步允许级联安装，并询问恢复 Git 轻入口可节省多少。由此形成本文的 registry 资源依赖建议。**本次请求是编写修改建议文档，不等于授权执行新方案、发布 registry 包或重写历史。**

## 3. 体积基线与收益口径

以下按 `git ls-tree -rl HEAD` 的 blob 文件大小求和，单位 MB 为十进制，MiB 为二进制：

| 内容/方式 | bytes | 约 MB | 说明 |
| --- | ---: | ---: | --- |
| 当前提交树文件总量 | 346,983,586 | 346.98 | 当前版本文件总量，非整个历史 |
| 72 项 payload / 77 文件 | 302,035,054 | 302.04 | 约 288.04 MiB |
| 皮肤预览 | 32,393,580 | 32.39 | 图片仍会使入口偏大 |
| 只移出 payload | 44,948,532 | 44.95 | 比当前文件总量减少约 87.05% |
| 同时移出 payload 与预览 | 12,554,952 | 12.55 | 比当前文件总量减少约 96.38% |

推荐连同 gallery/Prompt 一并移入资源包，12.55 MB 是仅减掉 payload 和预览后的参考值；最终还应加减新代码、包描述、迁出的其他小文件，以实测为准。

两个最大资源：`dsh-dafeiyu` 167,827,628 bytes，`dsh-pet` 62,222,749 bytes，合计约占 payload 的 76%。资源已经压缩，分块不降低总量。

必须区分：

- **当前树大小**：删掉文件可降低这一项。
- **本次 Git 上传**：若从待交付分支历史中排除 `912edd5`，可避免上传这批 302 MB 资源 blob；具体传输量受 Git 打包影响。
- **Git 历史/首次 clone**：新增删除提交仍保留历史中的资源，不能据此宣称历史变小。
- **用户完整安装总流量**：完整资源仍需从 registry 或完整 Release 取得，没有凭空减少。
- **后续升级**：host-only 改动可继续使用原资源包版本；资源变化再发资源包，避免每次代码改动重传资源。整个 registry tarball 的更新不保证逐文件增量下载。

12.55 MB 的剩余 Git 文件中仍可能含历史截图等非必要内容；本阶段不做无关清理。若后续需要继续缩小，再单独审计。

## 4. 方案比较与选型

| 方案 | Git 小 | 安装结束时完整 | 主要边界 |
| --- | --- | --- | --- |
| 当前直接内置 payload | 否 | 是，已本地验证 | 二进制历史膨胀、上传下载慢 |
| Git + 普通 registry 必选依赖 | 是 | 设计上是，待实测 | 包名/发布权限、registry 可达性、宿主依赖策略 |
| Git + 直接 Release URL 子依赖 | 是 | 不能默认保证 | 本环境已被 exotic-subdependency 策略阻止 |
| Git + 启用后资源补齐 | 是 | 否 | 用户此前否决该最终体验 |
| `prepare/postinstall` 下载 | 是 | 取决于脚本执行 | 依赖脚本授权、网络失败，不能作为默认可靠路径 |
| Git LFS / 子模块 | Git 树可小 | 不作本方案承诺 | 安装器是否实际取到资源未验证，不引入额外前提 |

**选型建议：一份无脚本的 registry 资源包 + 精确版本依赖。** 不同时引入多 registry 镜像、资源微服务或多包拆分框架。先验证一包可行，只有实测上传/下载或 registry 限制失败时，才重新评估是否必须分包。

## 5. 目标包结构与契约

### 5.1 主包：`eac-plugin-suite`

- 保留根 Git 入口、`suite/index.js` / `client.js`、组合包 patch、locale、catalog、轻量固定清单。
- 根与 suite 两个入口都声明精确资源依赖；例如新版本可使用下述结构。
- 不使用版本范围 `^`、`~` 或 `latest`；入口版本与资源版本可独立，只有资源变化才升级后者。
- 不新增 `prepare`、`install`、`postinstall` 基线下载脚本，不把资源依赖声明为 optional/peer。
- Git 自包含 host 代码可继续 `private: true`；资源包若要发布，不得保留 `private: true`。

```json
{
  "dependencies": {
    "eac-plugin-suite-assets": "0.2.3"
  }
}
```

以上包名和版本是建议，尚未发布。若无权取得该名称，在实施前确定可公开安装的 scope；不假定拥有 npm 名称。

### 5.2 资源包：`eac-plugin-suite-assets`

建议源码只提交打包描述和构建脚本；实际完整产物生成到被忽略的 staging：

```text
.cache/resource-package-stage/package/
  package.json
  LICENSE / 第三方 NOTICE 或来源说明
  assets/bootstrap.json
  assets/payload/       72 项 / 77 个实际文件
  assets/gallery.json
  assets/previews/      30 张明暗预览
  assets/prompts/       10 项 Prompt 及 metadata
```

资源包是普通数据依赖，**不作为单独可启用的 DSH 组合包，不需要 dsh.bundle**；里面的 72 个子插件 tarball 仍必须保留各自合法 bundle 声明。资源包自身没有运行时依赖或安装脚本。

提供明确可解析的导出，例如 `./package.json`；host 从自己的模块位置通过 Node 包解析取得依赖目录，不硬编码 `.pnpm`、profile 根目录或全局 `node_modules`。如果使用 JSON metadata，按当前 Node 24 支持的方式读取，不依赖未验证的 API。

### 5.3 完整性、路径与失败语义

Git 内保留固定 bootstrap 清单，绑定资源包名称、精确版本、schema、完整 manifest 摘要以及已有资源/分块摘要。资源包内清单必须与入口固定清单匹配；预览和 Prompt 加入可验证文件清单，不只检查存在。

- registry 的 package integrity 校验与运行时文件摘要检查是两个层次，均保留。
- 资源依赖缺失、版本错误、文件损坏均明确失败，不能退回上游 latest、旧缓存、任意搜索路径或后台 HTTP 下载。
- 如果包管理器安装完成但 host 校验失败，显示“资源校验失败”，不能显示 ready；不声称包管理器已经验证了应用层每个文件。
- 定位 manifest/gallery/preview/Prompt 时都校验路径，禁止路径穿越；资源包解析失败不得悄悄以源码目录替代。
- 延用 `$DSH_HOME/eac-plugin-suite/resources/<sha256>/` 的验证与持久化 tarball，防止 child 的 `file:` 依赖随整合包卸载消失。
- Node/pnpm 的合法依赖目录可能是链接，不能简单拒绝整个已安装依赖根目录的符号链接；仍须验证解析后的固定文件、manifest 和 payload 边界。
- EAC-only、kernelProvided、皮肤互斥守卫不变，不自动启用第三方插件。

## 6. 具体文件改动范围

| 文件/位置 | 计划修改 |
| --- | --- |
| 根 `package.json`、`suite/package.json` | 精确依赖、两个入口一致；移除重资源 files 项；调整版本与 prepack |
| `suite/package-lock.json` 及实际使用的锁文件 | 按真实 registry 元数据刷新并验证，不手编 integrity，不嵌入 token |
| `suite/index.js` | 统一解析资源根；修改 createResources、gallery、preview、Prompt 读路径 |
| `suite/resources.mjs` | 保留纯本地校验/拼接和持久化；补资源契约，禁止引入下载回退 |
| `suite/assets/bootstrap.json` | 保留轻量固定契约并绑定资源包版本/清单摘要 |
| `scripts/build-resources.mjs` | 输出完整资源 staging，不再向 tracked payload 写大文件 |
| `suite/scripts/sync-assets.mjs` | 同步轻量目录/README；生成或验证 staging 资源，解除 Git 内重文件前提 |
| `suite/scripts/verify-package.mjs` | 分开 Git 入口门禁与完整资源门禁，不能要求未安装的依赖已在 Git 打包阶段可解析 |
| 新增 registry 资源构建/发布脚本 | 先 dry-run；检查无脚本/无依赖、文件白名单、manifest/摘要/许可，再发布 |
| `scripts/publish-resources.mjs` | 完整 Release 构建/验收/发布路径独立，不把资源包名称混为插件安装包 |
| `README.md`、`suite/README.md`、分发/API 文档、locale/client 文案 | 改为“安装阶段取得完整依赖，启用后本地校验”；保留失败与兼容性说明 |
| `suite/test/*` | 更新直接内置假设；覆盖依赖解析、清单一致、失败闭合、两个入口及完整 Release |
| `.gitignore`、`.gitattributes` | staging/build 产物排除；确定历史方案后停止跟踪重资源，不直接执行历史重写 |

**不修改**用户并行文档 `EAC-SKIN-LOADER-GOAL-PLAN.md`；不顺便变更渠道更新策略、Host 安装器权限或第三方插件代码。

### 6.1 特别注意 Git 打包阶段

Git 依赖的打包与依赖安装先后顺序必须在实际 pnpm 11.7.0 验证。Git 入口 `prepack` 不执行下载，也不要求资源依赖已经安装；它验证入口 metadata、目录覆盖、固定清单、精确依赖及不含大 payload。

资源完整性门禁在资源包构建/发布、完整 Release staging、安装后 host 三处执行。这不是降低完整性标准，而是放在资源真正可得的阶段验证。禁止以测试中跳过 prepack 来证明生产打包成功。

## 7. 单文件完整 Release 保留方案

推荐在隔离 staging 构建带 `bundleDependencies: ["eac-plugin-suite-assets"]` 的完整 Release，按 npm 正规打包流程将精确资源依赖随 tarball 收录。不要对生产工作区 profile 执行依赖安装，也不把 staging 内 `node_modules` 提交 Git。

- staging 采用 suite 平铺布局，host 与 Git 入口使用相同依赖解析逻辑。
- 构建阶段以固定版本安装或提取已验收资源包，关闭第三方生命周期脚本。
- 不假定 npm 会递归收录任意 pnpm 链接；检查打出包内真实资源字节，不接受 dangling links。
- 资源包 registry 发布物与完整 Release 内的资源必须逐文件 SHA256 一致。
- 使用空 profile 和空 store 执行完整 Release 的 `pnpm --offline --ignore-scripts` 实际安装；确认不访问 registry、依赖可解析、72/72 就绪。
- 若宿主实际拒绝 bundled dependency，停止声称“单文件完整离线安装”通过，记录诊断后再选显式嵌入资源布局；不默认添加双路径回退。

npm 支持 bundled dependencies 是官方机制；它在此 Desktop 的行为、是否满足冷缓存完整安装，仍是本阶段必验项。

## 8. 分阶段实施计划与停止条件

### 阶段 A：先确定发布基础设施

1. 核实 registry 名称可用、发布账号/scope 权限、公开可读性、可接受包体积以及许可/NOTICE。
2. 读取 Desktop 真实 registry/镜像及 supply-chain 配置，不修改它们。
3. 核实 `minimumReleaseAge` 等设置；新发布精确版本若受限制，等待允许时间，不关闭检查。
4. 准备固定版本普通数据包的最小试验，先证明默认策略允许级联并由宿主识别入口 bundle。

停止条件：无发布权限、registry 无法承载或默认策略拒绝。输出明确原因，不继续把“理论上可行”描述为可交付。

### 阶段 B：完整资源包构建

1. 复用已验证完整源/本地 dist，重新检查 72 项身份、摘要、bundle patch 和许可；不盲目使用旧 0.2.1 原始子包。
2. 生成完整 staging、预览/Prompt 清单及摘要，资源包必须无安装脚本、无运行时依赖。
3. 正常 `npm pack` 并解包验收全部内容；计算 registry tarball 大小/摘要，记录可复现构建证据。
4. 只有得到明确发布授权后才上传 registry。发布后再次下载该精确版本并核对内容，不能覆盖旧版本固定字节。

### 阶段 C：入口与 runtime 改造

1. 两个入口改为精确 registry 依赖，保留正确 dsh.bundle.patch 与 client 导出。
2. 统一资源根解析，迁出 payload/preview/gallery/Prompt 的读取。
3. 实现版本/摘要绑定、失败闭合和状态诊断，保留纯本地资源管理器。
4. 更新打包门禁、测试和文档；先构建新交付快照验证，再调整历史，不先删除唯一可用产物。

### 阶段 D：双入口真实安装验收

按第 9 节矩阵验证。所有产物必须与最终待交付源码一致；不能使用占位资源或本地 `file:` 依赖来替代真实 registry 证明。

### 阶段 E：Git 历史整理与交付

1. 再查远端 ref、是否有人已安装/拉取大资源提交，确定第 10 节适用路径。
2. 获得历史调整授权后保留备份，构造不含重资源的新交付分支；先核对提交范围和资源包可用性。
3. 先资源包可用并通过所需发布年龄，再推入口；不能先推一个依赖尚不存在的 Git 入口。
4. 按授权推送，核对远端 commit，不以暂时进度判定成功。远端安装由用户手动执行；仅用户报告通过后记录通过。
5. Release 发布是单独操作，不因为 Git 推送获批而自动发布。

## 9. 验收矩阵

| 项目 | 必须观察到的结果 |
| --- | --- |
| Node 24 与系统 Node | 回归测试通过，既有成功/失败断言不弱化 |
| Git 入口正常打包 | 无重 payload/preview，无下载脚本，精确资源依赖与组合包声明正确 |
| 默认 pnpm 11.7.0 + 空 store | 通过 registry 级联安装，没有 exotic-subdependency 错误，没有新增审批/关闭安全策略 |
| 资源包不可达/不存在 | 包管理器明确失败；不能成功安装成无资源状态 |
| 断网发生在依赖下载中途 | 不把失败缓存当完整资源；恢复网络重试后完整校验通过 |
| 安装后禁用 baseline fetch | 72 项大小/分块/完整 SHA256 检查与 ensure 全通过，baselineFetches=0 |
| 版本错配、缺文件、损坏 | 明确 failed，不能借旧缓存、上游 latest 或联网回退遮掩 |
| Desktop 官方对话框 + 本地真实 Git 来源 | 最终正常 registry 依赖解析、入口可管理、启用后 72/72；本地 file: 资源夹具不算通过 |
| 普通/皮肤/大资源子插件 | viewport-lock、blue-fantasy、pet、dafeiyu 实际安装成功且按指定状态保持禁用 |
| 皮肤资源 | 15 条目录、30 张预览完成解码、10 项 Prompt 返回非空内容 |
| bundled 完整 Release + 空 store | 冷缓存离线安装成功、依赖实际随包、72/72；无悬空链接 |
| Git 与 Release 一致 | 同一资源版本与逐文件摘要，host/client 行为一致 |
| 用户手动远端 Git 安装 | 用户按固定 commit 安装，成功结果附日志；未收到结果前保留“未验收” |
| 体积检查 | 交付树不含重资源，记录 Git 打包/首次拉取/资源包实际大小，分开统计 |

额外边界：资源包已装入不等于 72 个子插件都已装入 profile，更不等于全部启用；保持当前用户选择与兼容性限制。UI/图片像素验收受环境限制时，明确记录，不把黑帧当通过。

## 10. Git 历史、备份与回滚

### 10.1 大资源提交未进入远端

以实施时的 `ls-remote` 为准。若远端仍为旧 `15672c6` 且本地后续没有其他用户提交，可在备份/授权后从安全基线组织新的代码提交，不把 `912edd5` 作为待推分支祖先；整理 `b0daf19` 与新改造时避免存在缺资源依赖的最终交付状态。

当前 docs/资源二进制/完整 Release 可另存本地备份；备份 ref 若仍含大 blob，不应 `push --all` 或推送备份 tag。旧对象留在本地不影响新分支正常 push 的对象集合，也不等于已清理本地 `.git`。

### 10.2 大资源已经进入远端

- 普通后续删除：不改共享历史，但历史体积不明显减少；如采用此路径必须如实说明。
- 真正去除历史 blob：先协调所有使用者和备份，制定范围，再单独授权历史重写和 `--force-with-lease`。不使用无条件 force，不假定服务器立即物理回收对象。
- 新的干净交付分支/仓库：可避免安装路径继续取得旧祖先资源，但改变默认安装来源，需用户确认。旧仓库历史仍存在。

本阶段不提供直接可执行的 reset/filter/强推命令，避免建议文档被误当作已获授权的破坏性操作。

### 10.3 回滚策略

- 在新资源包发布前保留当前 0.2.2 本地完整 Release/源码快照与 SHA256，验证备份可读。
- registry 包一经发布不覆盖；后续修复发新版本。入口回滚使用已验证的固定资源版本。
- 完整资源包未通过，不删除当前可用完整产物，不把旧源码历史强制改写为不完整状态。
- profile 快照与持久化资源目录沿用已有机制；卸载新入口不应删掉仍被 child file: 依赖使用的 tarball。

## 11. 风险与待确认项

1. **发布权限**：registry 包名/scope、账号及公开分发权限尚未确认；文档不是发布授权。
2. **依赖策略**：在线官方文档可能描述更新的 pnpm 版本；本任务以 Desktop 实际 11.7.0 为准，不引入仅新版本支持的配置。
3. **registry 包大小/镜像同步**：约 334 MB 资源与预览仍需传输；能否一次公开发布和被当前镜像及时解析需实测。
4. **安装完整性定义**：registry 成功提供数据依赖后，应用层 SHA256 仍由启用时验证；不能用“包管理器成功”掩盖 manifest 不匹配。
5. **主包双入口**：只改根依赖、漏改 suite，或只调整 payload、漏掉 preview/Prompt，都会导致能力不一致。
6. **供应链与凭据**：资源包无脚本，保留摘要；不嵌入发布 token、不上传用户 profile 或缓存凭据、不关闭安全策略。
7. **授权边界**：实现/registry 发布/历史重写/Release 发布分别说明后果并按用户授权执行。

## 12. 资料与证据索引

仓库已有证据：

- `FULL-GIT-INSTALL-TEST.md`：当前直接内置完整资源的本地验收。
- `FULL-INSTALL-TEST-2026-10-04.md`：机制夹具和 URL 子依赖撤回记录。
- `LOCAL-INSTALL-TEST-2026-10-04.md`：已撤回的轻量启用后补齐，保留当时失败边界。
- `DISTRIBUTION.md`：资源来源、许可、共享冲突与退役说明。
- 当前包 metadata、host 资源定位函数、build/verify/sync 脚本：第 6 节改造点的代码依据。

2026-10-05 查询的一手官方文档：

- pnpm dependency-resolution，`blockExoticSubdeps` 与 `minimumReleaseAge`：https://pnpm.io/settings/dependency-resolution
- npm package.json，dependencies 与 bundleDependencies：https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

官方文档确认相关机制，不等于本任务新架构已完成实现或 Desktop 验收。本地级联试验与实现已推进；当前下一步是 **提供生产 npm 发布凭据，先发布并验证资源包，再推送轻入口**。未授权或未完成的生产步骤仍保留明确边界。
