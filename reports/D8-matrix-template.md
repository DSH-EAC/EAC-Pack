# D8 真机实测矩阵 — EAC 全量包（模板）

- 环境：官方 DeepSeek Harness 桌面端 v0.2.0-rc.2，profile: desktop
- 方式：整合包 UI → EAC 全量包 → 一键安装；每项安装后逐个冒烟
- 冒烟口径：①安装成功 ②插件启用 ③功能可见（设置页/侧栏/会话内 UI 或行为）④不破坏壳
- 记录：state ∈ ok | ok-disabled(预期默认禁用) | warn | fail(原因)；截图/日志存 reports/d8/

| # | id | name@version | tier | 默认启用 | 安装 | 启用 | 冒烟 | 备注 |
|---|----|--------------|------|---------|------|------|------|------|
| 1 | balance | | core | | | | | |
| 2 | file-changes | | core | | | | | |
| 3 | client-file-changes | | core | | | | | |
| 4 | terminal | | core | | | | | |
| 5 | plugin-manager | | core | | | | | |
| 6 | float-window | | visual | | | | | |
| 7 | conversation-tweaks | | core | | | | | |
| 8 | prompt-custom | | core | | | | | |
| 9 | openclaw-bridge | | heavy | | | | | |
| 10 | stt | | heavy | 默认禁用 | | | | 模型体积大 |
| 11 | skin-switch | | visual | | | | | |
| 12 | easy-setup | | core | | | | | |
| 13 | eac-core-bridge | | core | | | | | |
| 14 | eac-locale-compat | | core | | | | | |
| 15 | plugin-shield | | core | | | | | |
| 16 | file-drop-eac | | core | | | | | |
| 17 | settings-scroll-fix | | visual | | | | | |
| 18 | viewport-lock | | visual | | | | | |
| 19 | dock-settings | | core | | | | | |
| 20 | font-custom | | visual | | | | | |
| 21 | pet-settings | | visual | | | | | |
| 22 | phone | | heavy | | | | | |
| 23 | feature-toggles | | core | | | | | |
| 24 | plugin-wizard | | core | | | | | |
| 25 | think-zh-expand-eac | | core | | | | | |
| 26 | webui-prompt-optimizer | | core | | | | | |
| 27 | picturereader | | core | | | | | |
| 28 | computer-user | | heavy | | | | | |
| 29 | agent-teams | | heavy | | | | | |
| 30 | better-sidebar | | visual | | | | | |
| 31 | change-review | | core | | | | | |
| 32 | compact | | core | | | | | |
| 33 | composer-dynamic-island | | visual | | | | | |
| 34 | dafeiyu | | visual | | | | | |
| 35 | meow-smooth | | visual | | | | | |
| 36 | message-rewind | | core | | | | | |
| 37 | navbar | | visual | | | | | |
| 38 | offpeak | | core | | | | | 上游可能不可得 |
| 39 | pet | | visual | 默认禁用 | | | | |
| 40 | raw-html | | visual | | | | | |
| 41 | session-manager | | core | | | | | |
| 42 | settings-groups | | core | | | | | |
| 43 | side-session | | visual | | | | | |
| 44 | soul-md | | core | | | | | |
| 45 | undo-savepoint | | core | | | | | |
| 46 | unified-market | | core | | | | | |
| 47 | web-mobile-fix | | visual | | | | | |
| 48 | whale-widget | | visual | 默认禁用 | | | | |
| 49 | image-paste | | core | 默认禁用 | | | | |

（实际行数以 catalog/eac.json 定稿为准；退役 8 项不在其中。）

## AIO 矩阵（D9）

9 插件 + 第三方运行时包 + 可选 10 皮肤，同口径记录。

## 场景测试（D9）

- [ ] 更新中心：制造新版 → 检测 → 升级 → 重启生效
- [ ] 卸载整合包本身：保留已装插件 / 连带清理两种模式
- [ ] 快照回滚：人为失败 → 回滚 → profile 与安装前一致
- [ ] 既有插件不受影响：dsh-our-free-model 全程可用
- [ ] 空目录 / 后端失联 / 安装中断三种异常态 UI 表现
