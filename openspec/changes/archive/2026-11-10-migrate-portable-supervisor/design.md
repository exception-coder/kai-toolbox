## Context

现有 scripts/internal/run-supervised.ps1 和 scripts/run-supervised-macos.sh 包含重复的守护、配置、构建与 HTTP 控制逻辑。SupervisorControlClient 依赖 protocolVersion=1、repoRoot、bootstrapAttached、capabilities.fullReload 及 X-Restart-Token。RestartRuntime 包含 Windows PowerShell 与 Unix shell replacement helper。工作区中的启动性能采集尚未提交，迁移必须保留其 build-started-at/build-scope/build-duration-ms 语义。

## Goals / Non-Goals

统一四个平台的源码进程生命周期、控制协议与配置读取；保留 Java 更新与 Agent Sidecar 所有权。不迁移业务工具使用的任意 PowerShell 命令，不安装开机服务，不改变数据库，不承诺过期 CentOS 能运行现代 Node/Java。

## Decisions

1. 使用仓库锁定的 PM2，私有 PM2_HOME 按用户和仓库隔离。CLI 仅加载依赖与发命令，控制器由 PM2 守护；不自建崩溃守护循环。PM2 官方依据：https://pm2.keymetrics.io/docs/usage/pm2-api/ 和 https://pm2.keymetrics.io/docs/usage/signals-clean-restart/ 。
2. controller 绑定回环地址，保留 v1 状态与令牌。变更串行；全重载先停止所管服务，再退出，PM2 重启 controller 从磁盘读取更新后的代码和配置。状态仅输出白名单，不公开进程环境和 token；未配置外部 token 拒绝外部重启。
3. 仅管理私有 PM2 实例中的命名进程；端口冲突报错，不接管未知进程。控制器启动失败不杀已有应用。停止控制器后删除受管应用，避免自动重新拉起。
4. 独立 runner 负责构建后执行。Maven 使用 Java classworlds 入口，npm 使用 Node npm-cli.js，避免 Windows cmd 转义。依赖锁变化才 npm ci；Python 安装只在 prepare 或 requirements 变化时执行。保留 .venv 和配置文件。
5. Java 更新调度不重复实现。后端通过环境接收内部 token；重启 controller 时刷新环境。Agent Sidecar 继续由 Java 关闭；PM2 兜底回收其进程树。
6. 按用户要求删除已被替代的旧快捷入口、配置迁移脚本和 Phoenix 脚本，更新活动调用方与说明。Task start/stop/status/restart 与 CLI 共用实现，删除 legacy 别名。保留仍在使用的质量门禁和专项工具；保留用户本机配置与数据。可选观测依赖单独 Compose，不成为源码启动前置。
7. PM2 7 Windows 固定命名管道通过只加载于 PM2 的隔离适配器覆盖；关闭 pidusage 的可选 WMI/PowerShell 资源统计，不伪造对外 CPU/内存指标。Windows killDaemon 回调可能不返回，stop 在删除所有受管进程并断开 RPC 后终止私有 daemon；不读取或影响全局 PM2。适配器固定依赖版本并有真实双实例测试。
8. backend IPC 优雅退出先请求 Java，10 秒后回收自己所属的进程树，早于 PM2 15 秒 wrapper 超时；避免只结束 Maven 包装器而留下 JVM。

## Risks / Trade-offs

- PM2 API 会持有进程环境 → 使用当前用户私有目录，不 dump/save 环境快照，状态白名单；不将令牌写入命令参数。
- 构建失败或辅助服务缺依赖 → PM2 有限快速失败重试、独立日志和状态，主服务不等待可选模型下载。
- 源码更新改变控制器 → PM2 独立存活，重新加载磁盘入口；PM2 自身依赖升级通过 stop/prepare/start 完成。
- Windows/macOS/Linux 差异 → 无 shell 执行，真实 PM2 隔离测试；跨系统实机尚未执行必须明确列出。
- 可选 HotReload → 用 PM2 watch 触发后端完整源码重启，避免旧 DevTools 上下文泄漏。

## Migration Plan

验证新入口及隔离进程后替换旧包装器、文档。正在运行的旧守护须由原终端退出后启动新入口；不根据端口自动迁移活进程。回滚使用 Git 中旧入口版本并先停止新守护，无数据迁移。

## Open Questions

启动反馈补充：start 对新增和已有实例均等待核心服务 HTTP 响应，默认超时 600 秒；终端展示固定阶段标记和 15 秒心跳，只输出受控状态，不转储服务环境。主服务就绪与辅助服务失败分别展示，超时或核心失败返回非零且保留后台进程。TLS 探测仅对回环地址允许本机开发证书；不改变应用的 TLS 校验策略。

无待定业务选择。平台运行验收与真实服务切换单独记录，不伪称已完成。
