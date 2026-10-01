# D6 — 整合包 UI 打磨 & 开发预览环境（client 线）

日期：2026-10-01 · 范围：`suite/client.js`（浏览器半）、`suite/dev/*`（新增，dev-only）、`suite/package.json`（devDeps/scripts）
宿主半 `suite/index.js` 未做任何逻辑改动。

## 交付物

| 交付 | 路径 |
| --- | --- |
| 打磨后浏览器半 | `suite/client.js`（`node --check` 通过；手写 ModuleLoader 工厂包、运行时零构建零依赖、react 外全自写） |
| 开发预览环境 | `suite/dev/`（preview.html / boot.mjs / serve.mjs / mock-data.mjs / mock-entries.mjs / gen-entries.mjs / build-deps.mjs / react-entry.js） |
| 状态截图（7+1 张） | `reports/ui-preview/01…08*.png` |

截图索引（全部 1280 视口、真实点击驱动）：

- `01-loading-skeleton.png` 加载态（骨架屏）
- `02-ready-dark.png` 就绪态（暗色，zh）
- `03-installing-progress.png` 安装中态（进度条 + 快照行 + 最近 step + 实时日志）
- `04-job-failed.png` 失败态（红色 ERESOLVE 失败行 + 「任务完成：成功 40 · 失败 1」+ 40/41 卡片）
- `05-empty-catalog.png` 空态（虚线空目录面板）
- `06-load-error.png` 错误态（后端不可达 + 重试）
- `07-ready-en.png` 就绪态（英文）
- `08-ready-light.png` 就绪态（亮色）

## T1 dev 预览环境设计

- **还原壳的接缝，不复制 UI**：`boot.mjs` shim `window.__ModuleLoader__`（收集 factory 产物后调用 `mod.apply(mockCtx)`）、mock `require('react')`（esbuild 把 react+react-dom 打成 IIFE 挂 `window.__DEV_REACT__`，见 `dev/build-deps.mjs` → `dev/vendor/react.iife.js`，已 gitignore）、mock ctx（slots 注册表 / locale 字典注册 / effect / EventSource / fetch 全部仿真）。
- **mock 数据来自真实 catalog**：`dev/gen-entries.mjs` 从仓库 `catalog/eac.json` 生成 41 条 EAC（tier：26 core / 11 visual / 4 heavy）+ 5 条 AIO（4 真实共享项 + 1 运行时）+ 10 条社区皮肤 = 15 条 AIO/皮肤；installed/enabled/updateAvailable/defaultEnabled=false 各状态都有覆盖（23 装 / 5 禁用 / 4 可更新 / 13 默认禁用）。目录变更后重跑 `node suite/dev/gen-entries.mjs` 即可。
- **安装流程仿真**：`dev/mock-data.mjs` 按宿主半同款事件编排放映 job-start → step-start → step-ok/warn/fail → job-done；脚本化结果：`computer-user` 必败（ERESOLVE peer）、`openclaw-bridge` 豁免（warn→ok "installed with version exemption"）、`agent-teams` 构建脚本 warn。任务完成后 mock store 就地变更，UI 刷新后徽章/卡片计数随之变化（可更新徽章被消费、失败项保持未安装）。
- **场景面板**（页面顶部黑条，dev-only 纯 DOM，不属于插件 UI）：场景（就绪/加载中/错误/空目录）、语言（中/EN）、主题（亮/暗/跟随系统）、安装速度。主题/语言切换用于验证壳变量适配与字典。
- **serve.mjs** 零依赖 node 静态服务器（`node suite/dev/serve.mjs [port]`，默认 4310；本机 4310 被占用时换端口即可），直接映射 `suite/` 目录——预览跑的就是将来上真机的同一份 `client.js`，无拷贝无构建。
- 启动方式：`npm i -D react react-dom esbuild --prefix suite`（已装，写入 devDependencies）→ `npm run dev:deps`（首次，产物已生成）→ `npm run dev`。

## T2 client.js 打磨内容

1. **修复 `_t` 双重格式化 bug**（真机也受影响的潜在问题）：`SuiteTab._t` 原实现 `fmt(t(x), vars)` 在 vars 为 undefined 时会把 `{n}` 占位符洗掉，调用方再 `fmt(tr(key), vars)` 就拿不到变量。新约定：**无 vars 返回原始模板，有 vars 先翻译后 fmt**（同时兼容「壳内插值」和「返回裸模板」两种 locale.bind 实现）。
2. **套餐卡信息层级**：名称 + 右侧 `n/m` 计数 chip → hint → 进度条 → 底部「已装 | pct%」caption（消除原先 n/m 重复展示两遍的噪音）；进度条动画从 width 过渡改为 `transform: scaleX()`（符合只动 transform/opacity 的硬约束）。
3. **徽章系统**：tier 徽章三档语义——core 中性灰、visual 品牌蓝（business）、heavy 警示橙（warning），内联在标题后；状态徽章——已启用（success 底）、已装未启用（中性描边）、可更新（warning 底 + `a → b` 版本）、未安装（虚线描边）；版本号 chip 用等宽字体；**红色只出现在「移除所选」**（armed 二次确认时红底填充 + pulse）与错误语义文本。
4. **进度面板**：任务行内进度（spinner + `安装进度 · 安装 · eac` + 右侧 `n/m · pct`）+ 快照行（自动快照名）+ 最近一条 step 状态行（按 start/ok/warn/fail/done 着色的圆点 + 文案，job-done 显示「任务完成：成功 x · 失败 y」）+ 可展开滚动日志（时间戳 + 级别符号 `▸ ✓ ! ×`，start 蓝 / ok 绿 / warn 橙 / fail 红），日志自动滚底；**日志展开状态提升到 SuiteTab**，任务结束后的状态刷新（loading 相会卸载面板）不再吞掉展开状态与失败证据。
5. **三态完整**：骨架屏（卡片×3 + 工具栏条 + 列表×6，扫光动画用 `::after` translateX 实现，纯 transform）；错误态（图标 + 标题 + mono 详情 + hint + 重试）；空态（虚线面板 + 图标 + 标题 + hint）。修复了原先 loading 分支不注入 `<style>` 导致骨架屏裸奔的问题——现在 CSS 在所有分支统一注入。
6. **动效**：卡片/列表 stagger 入场（suite-rise，opacity+translateY，行级 `min(i*18,360)ms` 封顶）；勾选行高亮（business 6% 底色过渡）；按钮 hover/active/armed 过渡；`prefers-reduced-motion` 下全部动画/过渡关闭；交互目标 60fps（无布局属性动画）。
7. **i18n 补齐**：新增 `installedShort / defaultDisabled / error.hint / empty.title / empty.hint / progress.done / job.install|update|uninstall / log.empty`，zh/en 同步；清理了工具栏硬编码的「默认禁用」。
8. **可达性小项**：卡片 `type="button"` + `aria-pressed`、`:focus-visible` 描边、图标 `aria-hidden`。

## 设计决策与取舍

- **scaleX 代替 width**：进度条 4px 高，scaleX 在小比例下圆角形变肉眼不可见，换来对「动画只用 transform/opacity」约束的严格遵守。
- **日志保持 120 行窗口**：与宿主半 500 ring 对齐足够调试，DOM 数量可控（60fps）。
- **mock 速度默认 150ms/步**：41 条 EAC 一键安装约 6.5s 放映完，兼顾截图窗口与观感；「慢」档 1400ms 供人工观察。事件编排与真实队列一致（含 job-start 快照、job-done 汇总），agent-browser 每次调用之间守护进程会重启，因此安装态截图均在单次调用内完成全流程。
- **不做的事**：行内过滤/搜索、卸载后行内撤销、多任务队列视图——超出本次打磨方向，留给 D7+。

## 遗留建议

1. 真机回归时确认壳的 `locale.bind` 语义（裸模板 vs 内插值）——新 `_t` 两种都兼容，但建议在真机过一遍 EN 文案。
2. 壳若能提供 `--dsw-alias-gap` 之外的结构性变量（卡片圆角/阴影），可进一步对齐原生观感；当前用固定 12px 圆角。
3. `dev/preview.html` 的主题变量是照壳文档手抄的近似值，若壳变量有出入以真机为准。
4. `suite/package.json` 的 `test` 脚本从 `node --test test/` 改为 `node --test`（Windows 下带斜杠目录参数会被当作模块路径导致测试runner报错；与本次 UI 改动无关，顺手修复）。
