# D10 真机测试计划 — v0.2.0「完全体」

- 对象：官方 DeepSeek Harness 桌面端 v0.2.0-rc.2（`D:\deepseek官方桌面端`）
- 被测：`dsh-plugin-suite` **0.2.0**（离线内置 16 皮肤 + 在线渠道 + 设置页 UI v2）
- 前置：C 盘空间检查（≥5GB）；DSH_HOME=`C:\Users\HUAWEI\.dsh`；测试前 `taskkill` 干净启动，CDP 9222 驱动（`.cache/cdp/dsh.js`）

## 场景矩阵（对应验收标准）

### A. 部署
| # | 场景 | 预期 |
|---|---|---|
| A1 | npm pack suite 0.2.0 → 桌面端插件页导入安装 → 重启 | 插件激活，trace.log 有 apply-start，API 可达 |
| A2 | GET /status | packs.skins 含 16 条（10 内置 + 6 社区，maid-atelier 为社区新版） |

### B. 离线安装（验收 1）
| # | 场景 | 预期 |
|---|---|---|
| B1 | UI 一键安装 EAC 全量包 | 成功率 ≥ D9 基线（46/48；terminal/plugin-manager 内核自带跳过） |
| B2 | UI 一键安装 AIO 独有 | ≥ 18/19 |
| B3 | 皮肤馆安装全部 16 皮肤 | 15/16 以上成功；社区失败项记录豁免 |
| B4 | job 引擎事件/SSE 进度/快照 | 每步事件、快照自动生成 |

### C. 在线渠道（验收 2/3）
| # | 场景 | 预期 |
|---|---|---|
| C1 | 渠道首发后 UI 顶栏 pill | 在线·渠道 vN；/channel/status 拉到真实 channel.json |
| C2 | 渠道发布 blue-fantasy 新版（catalog 锁 0.1.11 → 渠道 0.2.0）→ POST /channel/check | updates 含 blue-fantasy（0.1.11→0.2.0，installed:true） |
| C3 | POST /channel/apply {ids:[blue-fantasy]} | download-progress SSE → sha256 校验 → cache 落盘 → installBundle → 重启后生效 |
| C4 | 自动更新：config autoUpdate=true + intervalHours 最小值 | 定时/启动探测后自动应用已装项更新；heavy 项不自动更（autoUpdateHeavy=false） |
| C5 | 断网（断代理/防火墙阻断）→ POST /channel/check | state=offline，UI pill 灰，UI 无报错 |
| C6 | mirror 前缀配置 POST /channel/config | mirror 持久化、probe 走镜像 |

### D. 皮肤馆（验收 4）
| # | 场景 | 预期 |
|---|---|---|
| D1 | GET /skins/gallery + /asset/previews/miku/light.png | 16 皮肤条目；预览图 PNG 200（离线可读） |
| D2 | UI 皮肤馆渲染 | 卡片网格、明暗预览切换、占位图容错 |
| D3 | 安装并启用 ≥1 款社区皮肤（deep-whale-manager 或 endfield） | 真机换肤生效（截图） |
| D4 | GET /prompts/miku | manifest + prompt.md 全文；UI 抽屉展示 + 复制 |
| D5 | miku 皮肤更新后整壳换肤回归 | 换肤仍生效 |

### E. 回归（验收 5）
| # | 场景 | 预期 |
|---|---|---|
| E1 | 卸载/重装（offpeak、think-zh-expand-eac） | 干净移除与恢复 |
| E2 | 快照恢复 POST /restore | restartRequired 语义不变 |
| E3 | update 类型保状态：禁用皮肤走 /update | 更新后仍禁用（不翻 enabled） |
| E4 | 离线状态下 UI 全四区切换 | 无白屏/报错；pill=离线 |

### F. UI 视觉验收（验收 6/7）
| # | 场景 | 预期 |
|---|---|---|
| F1 | CDP 截图：概览/皮肤馆/插件管理/更新中心 × 明/暗 × 中/英 | 送视觉评审；无破版溢出 |
| F2 | 动效检查（截图序列/录屏帧） | 入场 stagger、进度 morph、toggle、抽屉滑入 |
| F3 | prefers-reduced-motion 模拟 | 动画降级无布局抖动 |

### G. 工程（验收 7/8）
| # | 场景 | 预期 |
|---|---|---|
| G1 | node --test（11 用例） | 全过 |
| G2 | verify.mjs 扩展后全量校验 | 通过 |
| G3 | publish-channel 幂等重跑 | channelVersion 递增、release 资产覆盖成功 |
| G4 | GitHub Release v0.2.0 | suite tgz + dist-artifacts + channel 资产齐全 |

## 执行顺序
A → B → C1 → D → E → C2-C4（渠道二阶段）→ F → G。C2 起需要渠道二阶段发布（blue-fantasy 0.2.0）。

## 记录
结果逐条回填到 reports/D10-final-test-report.md，截图存 reports/（d10-*.png）。
