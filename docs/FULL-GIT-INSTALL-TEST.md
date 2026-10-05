# eac-plugin-suite 全量 Git 安装验收

## 结论

本地完整交付已通过：生产 72 项资源直接随 Git/Release 提供，启用后只本地校验/拼接，不下载基线。官方 Desktop 安装对话框已经成功安装本地真实 Git URL，启用后 resources=ready、72/72。

本报告记录本地全量验收。提交和推送已获用户授权，远端 Git 安装由用户另行手动复验；本次不创建 Release，也不把本地结果冒充远端安装通过。

## 资源来源与构建

- 官方 v0.2.1 dist-artifacts-0.2.1.tar.gz：312,762,001 bytes。
- 官方固定 SHA256：1e96a5dadecf85eac1c565ce2f2fd5fd64ce9d93d267140c8054c0f09e3aed0c。分段下载后完整 SHA256 一致。
- 外层归档含重复副本；只导入 index.json 的 72 个 canonical 文件，导入前逐项校验大小、摘要和当前目录匹配。
- 25 个资源原本缺组合包声明，直接安全重归档补齐 bundle；47 个已带声明。没有执行第三方生命周期脚本。
- 构建后 72 项、302,035,054 bytes，生成 77 个实际 payload 文件；每块最大 41,943,040 bytes（40 MiB），不是 Git LFS 指针。
- Git 和 Release 的清单与每块 SHA256 均一致，两入口正常 prepack 通过。根包也包含 suite/package.json，安装后完整性门禁仍可执行。

## 真实 Git 与 Release 安装

Desktop：官方 0.2.0-rc.2，pnpm 11.7.0；隔离配置在 .cache/git-full-desktop/home，不修改日常 profile。为避开日常实例端口，仅给隔离 webserver 指定 127.0.0.1:19487。

官方添加插件对话框成功安装：

```text
git+file:///G:/Code/fork/EAC-Pack/.cache/full-delivery/git-source#7bd32d98ed15d9fcd66a1b3aaa980dfce51cd8c2
```

pnpm 完成耗时 38.1 秒，Packages +1；没有关闭 exotic-subdependency 策略，没有 prepare/postinstall，不再出现未声明组合包错误。

安装后的实际包执行全量 ResourceManager 测试，fetch 被替换为计数加抛错：72/72 通过，baselineFetches=0；逐项持久化后再读取全部 tarball 的身份及 bundle 声明，72/72 一致。

Release 全量 tarball 另经 pnpm --offline --ignore-scripts 安装；安装后同样 72/72、baselineFetches=0。离线标志不是新增基线下载的绕过：包内已经包含全部固定资源。

## Desktop 主路径

- 启用整合包后 API 200，resources.state=ready、mode=installed、completed=total=72；界面 DOM 显示完整资产就绪和 302.0 MB。
- 真实安装 viewport-lock@1.0.1、blue-fantasy@0.2.0、pet@0.3.1、dafeiyu@0.1.14；三次任务分别 ok=1、1、2，failed 均为 0。
- pet 62,222,749 bytes（2 块），dafeiyu 167,827,628 bytes（5 块），验证了大资源拼接后经宿主安装。
- 四个子插件 enabled=false，没有自动启用皮肤或原生桌宠。
- 皮肤馆 15 项；实际 30 张明暗预览完成浏览器解码，naturalWidth>0。10 项 Prompt API 返回非空内容。
- 安装后的 host/client/资源管理器/patch/package metadata/manifest 与本地源码摘要一致。
- CDP 截图返回黑帧，不作为像素级验收证据；以上 UI 验收依据实际点击、DOM、图像解码和运行 API，没有将黑图宣称为视觉通过。

## 边界

这是全部基线资源可用与安装管理主路径验收，不是所有 72 个第三方插件逐个启用或所有功能运行的证明。EAC-only、kernelProvided 和皮肤互斥守卫保留。第三方传递依赖仍由宿主解析，可能需要网络；baselineFetches=0 不代表整个第三方依赖图均离线。在线 channel 更新仍是独立能力，不是启用后补齐基线。

旧机制报告继续保留为历史证据，不应与此次全量生产资源验收混淆。

## 可复核证据

- .cache/full-source/source-verified.json
- .cache/full-delivery/git-offline-evidence.json
- .cache/full-delivery/release-offline-evidence.json
- .cache/full-delivery/packed-equality.json
- .cache/full-delivery/desktop-evidence.json
- .cache/full-delivery/tests-node24.log / tests-node25.log
- .cache/git-full-desktop/home/eac-plugin-suite/events.jsonl

最终 tarball 大小与 SHA256 以 packed-equality.json 为准。发布门禁 --dry-run 不执行上传。提交和推送已获授权；Release 发布仍需单独授权。

## 回归与发布门禁

系统 Node 25.9.0 与 Desktop 自带 Node 24.21.0 均通过 41/41 测试；syntax 检查与 git diff --check 通过。曾发现渠道测试以固定 50 ms 延迟代替任务完成，在 I/O 竞争时误判；已改为等待真实 queueTail，再跑两种 Node，未降低任何成功/失败断言。

Git/Release README 使用相同文档，sync-assets 自动同步；.gitattributes 将 payload 标记为 binary，避免换行转换污染资源摘要。最终本地 Git CLI 安装快照和资源校验 URL 见 git-offline-evidence.json；Desktop 对话框使用上文所列的运行时代码相同快照。完整 Release prepack 与发布 --dry-run 均通过，没有上传。
