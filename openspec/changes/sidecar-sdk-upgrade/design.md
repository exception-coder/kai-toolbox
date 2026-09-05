## Context

SidecarVersionService:40 已维护三个 npm 引擎；PluginPanel:421 提供只读版本检测。codexAppServer:540 调用随 SDK 安装的 CLI。ClaudeChatService:2066 提供涵盖未决审批、后台任务、一次性调用的活动快照。SidecarProcessRegistry:136 管理重启；SidecarClient:536 是所有任务发送入口。

## Goals / Non-Goals

管理员在团队依赖面板选择引擎，一键检查并升级，查看阶段状态。首个升级为 Codex 0.153.4。不升级外部 CLI、不手填 Shell 命令、不改变数据库。

## Decisions

- 后端固定引擎 ID 到 npm 包名映射，复用版本检测；POST 启动单实例任务，GET 查询进度，浏览器关闭不取消升级。
- 在 Sidecar 同盘隔离目录复制源代码和 manifest/lock，固定版本安装，检查 Codex schema 并编译。准备失败不触碰在线运行文件。
- 切换前设置发送与启动维护栅栏，再校验活动快照。忙碌则保留在线实例并返回可重试结果；不自动等候或中断任务。
- 只提升 package.json、package-lock.json、node_modules、dist；原文件移动到同盘备份，重连成功才报成功。失败停止新进程、恢复备份并尝试恢复旧实例。保留备份和诊断日志供恢复，禁止盲目删除。
- 前端复用现有 PluginPanel 入口，独立 SDK 操作组件提供单引擎检查升级、阶段状态与错误重试。

## Risks / Trade-offs

- 源码或 manifest 在准备期间变化 → 提升前比较源内容与初始摘要，不覆盖并发修改。
- Windows DLL/EXE 锁 → 空闲后停进程、同盘移动失败触发回滚。
- 账号不同 → model/list 为权威；SDK 更新不保证所有账号具备 GPT-6 权限。
- 新版协议变化 → schema 检查失败即阻止提升。
- 进程意外终止 → 保留带备份路径的任务诊断文件；不宣称跨 JVM 自动恢复。

## Migration Plan

验证后提升 Codex 0.153.4，重连 Sidecar。失败恢复备份。执行 Sidecar 测试、后端升级边界测试、前端类型检查、浏览器界面检查与项目质量门禁。既有测试失败如实记录。

## Open Questions

无。
