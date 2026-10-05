# eac-plugin-suite 本地 Desktop 安装验收（2026-10-04）

> 历史记录：本文验收的是已撤回的“先轻量、启用后补齐”方案，不是当前“安装即完整”方案的验收。

## 结论

**轻量安装入口通过；Git 安装后获得完整 Release 能力尚未通过，不建议发布。**

本次从根目录打包的轻量 tarball 经 Desktop 官方安装界面安装、启用并运行，实际验证了 Git 包使用的目录布局、导出和组合包声明。当前改动尚未推送，因此没有将本地 tarball 安装冒充远端 Git 安装验收。

## 环境与隔离边界

- Desktop：`G:\Deepseek Harness Desktop\DeepSeek Harness.exe`，版本 `0.2.0-rc.2`。
- 测试包：`eac-plugin-suite@0.2.2`，压缩大小 **32,262,771 bytes**。图片预览仍随包携带；72 个插件 tarball 不在轻量包内。
- 最终测试包：`G:\Code\fork\EAC-Pack\.cache\pack\eac-plugin-suite-0.2.2-finaltest.tgz`。
- `DSH_HOME`：`G:\Code\fork\EAC-Pack\.cache\local-desktop\home`。
- Electron 用户配置：`G:\Code\fork\EAC-Pack\.cache\local-desktop\user-data`。
- CDP 仅监听 loopback `9442`。没有操作用户日常 `~/.dsh` 配置。
- 禁用在线渠道自动更新，但保留资源自动补齐。安装示例使用 `setEnabled:false`，没有启用第三方插件。

## 真实宿主验证

1. 官方界面卸载旧测试包、安装最终包成功；profile 依赖记录为最终 tarball 文件地址。组合包可被管理，组件启用后 API 可访问，`suiteVersion=0.2.2`。
2. 安装目录的 host、client、ResourceManager 和固定 manifest 与工作区源码逐文件摘要一致。
3. 同版本重装后观察到旧 host 行为，必须完整重启隔离 Desktop 后才观察到最终 host 修复。不能只凭安装文件已更新认定运行中的模块已更新。
4. Settings → Built-in plugins → Suite 在真实资源事件和实际安装失败后正常渲染；`data-slot-error` 数量为 **0**。失败面板显示资源文件名、底层连接错误及重试按钮。
5. 点击实际界面的 Retry completion 后，状态恢复为 `downloading`，已有缓存被重新校验并复用，界面仍正常。
6. 缓存审计确认 **15/72** 个完整文件，合计 **5,585,970 bytes**，全部大小与 SHA256 匹配。重试阶段扫描尚未遍历后续缓存时会显示 14；15 是独立缓存审计结果，不代表所有资源已完成。

## 实际发现与修复

### 客户端资源事件导致空白页

资源事件曾被错误地放进 Timeline，调用该作用域不存在的 `setState`。已将状态更新放回 SuiteTab 的 SSE 处理，Timeline 只消费任务事件；新增实际 client 源码回归测试。真实 Desktop 中已验证不再出现 slot error。

### 安装错误被误认为成功

宿主安装接口会返回 `application:'failed'` 与结构化 `error`，并不总是抛异常。已检查并传播返回结果，防止 pnpm 返回 exit 0 时错误报告安装成功。

重启后的实际 `viewport-lock` 安装任务 `job-1791124871314`：

- `step-start`：1 次。
- `step-ok`：**0 次**。
- `step-fail`：`not-bundle`，保留 pnpm 诊断。
- `job-done`：`ok:0, failed:1`。
- 没有“成功后未持久化”的错误重试；无声明残留按现有清理规则移除。

### 下载错误缺少诊断

新增资源文件名及底层 cause code/message。实际 `compact` 请求两次连接尝试失败后，界面显示：`dsh-compact-1.0.1.tgz: fetch failed (UND_ERR_CONNECT_TIMEOUT ... github.com:443 ... 10000ms)`，任务明确失败，没有降级安装未校验的上游版本。

## 未通过项与发布阻塞

1. **固定旧渠道资源不是完整的合规组合包集。** 当前 manifest 固定到 channel 的资源版本 `0.2.1`。审计已下载的 15 个文件，其中 **12 个缺少 dsh.bundle**，包括 `dsh-viewport-lock`、多个 EAC 插件以及 blue-fantasy 皮肤。另 3 个带声明的文件也不能据此认定运行兼容性通过。
2. **GitHub 连接不稳定。** 实际宿主出现连接超时；72 个资源总计 **302,031,150 bytes**，没有完成全量下载。不能声称已经在真实 Desktop 中完成全部插件安装或整机离线验收。
3. `publish-resources.mjs --dry-run` 被当前 baseline 版本与专用资源 Release 不一致的检查正确阻止。没有创建或上传任何 Release。
4. 强制重启进程留下过一个 `.part` 测试残片；它没有被当作完整 tarball 或可安装缓存使用。正常取消清理由回归测试覆盖；没有为了美化验收结果清空缓存。

## 回归与证据

- Desktop 随附 Node **24.21.0** 运行 `node --test suite/test/*.test.mjs`：**39/39 通过**。
- 同一测试集在本机 Node 25.9.0 也通过。
- host/client/resources/sync/publication 脚本语法检查通过，`git diff --check` 通过。
- 覆盖摘要/大小失败闭合、缓存损坏、共享下载、并发上限、dispose 清理、固定版本缺失不降级、实际 client 事件、结构化管理错误及发布资产声明检查。
- 以上离线、完整资源集及部分宿主行为测试使用受控 fixture/mock，不替代未完成的真实 Desktop 全量验收。

本地证据均位于 `G:\Code\fork\EAC-Pack\.cache\local-desktop\`：

- `final-evidence.json`：安装源码一致性、缓存审计及实际 not-bundle 任务证据。
- `cache-audit.json`：逐资源大小、摘要及包声明。
- `final-failed.png` / `final-retry.png`：真实 Desktop 失败/重试截图。
- `home\eac-plugin-suite\events.jsonl`：真实运行事件记录。

## 下一步

先重打包全部插件，补齐正确的组合包声明和 patch 文件，再生成新摘要与固定清单；本地完整资源包须逐项安装验证，不能只检查 manifest。发布工具已增加身份、组合包声明和 patch 文件存在性门禁，但门禁不证明运行兼容性。专用资源 Release 的发布与 Git 推送必须另行授权。

测试结束时关闭隔离组件及隔离 Desktop，保留测试包、缓存和证据，不修改日常配置；未提交、未推送、未发布。
