# Codex 本机诊断日志保存告警

11 月 27 日约 01:05，Forge 会话在任务仍运行时收到 Codex 的诊断日志保存告警。该告警由 Codex 的日志写入器报告，日志库和会话状态库是不同的文件。现场 C 盘约有 48 GiB 可用空间，`logs_2.sqlite` 和 `state_5.sqlite` 的只读 `quick_check(1)` 均为 `ok`。同一时段未找到当次写入失败的底层错误分类。已有多个 Codex 客户端使用本机存储，完整性检查无法排除间歇性写入竞争。

Forge 在 Windows 启动内置 Codex App Server 时，通过该版本原生支持的 `log_dir` 参数把诊断日志放在 `~/.kai-toolbox/codex-app-server-logs/<profile>`。目录按授权目录分组。桌面与 Forge 分开写诊断库，原有的登录数据、会话状态库和会话历史继续使用原目录。旧日志保留。告警继续显示，并标明其含义和主机诊断入口。SDK 回退路径沿用原配置。

用 Forge 内置 Codex 0.171.0 在临时授权目录做原生握手。两个 Forge 配置的进程和一个默认配置的进程并行初始化并正常退出，三个进程共用临时状态库，诊断日志分别落在 Forge 目录与默认目录。该检查验证路径和并行初始化，未复现截图中的写入错误，也未使用真实会话。生产会话复验待加载目标 Sidecar 后执行。

Sidecar TypeScript 编译及 59 项 App Server 定向测试通过。Forge 门禁返回 `PASSED` 并退出 0，运行项仅检查现有服务的 HTTP 响应。PATH 上的 `codex doctor` 属于 0.147.0，诊断限时内未返回结果，已结束本次探针。它不作为 0.171.0 的验证依据。

依据：[Codex 0.171.0 日志目录解析](https://raw.githubusercontent.com/openai/codex/rust-v0.171.0/codex-rs/core/src/config/mod.rs#L4198) · [Codex 日志写入器](https://github.com/openai/codex/blob/main/codex-rs/state/src/log_db.rs)
