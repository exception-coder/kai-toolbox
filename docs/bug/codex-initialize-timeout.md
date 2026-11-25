# Codex 初始化等待

## 每轮冷启动与诊断缺口

`runCodexAppServerTurn` 当前每轮创建独立进程，在终态后确认进程释放才允许队列继续；`codexEngine` 随后可能启动独立预测进程。因此，前述“复用任务进程”仅消除单轮内 Skill 前置检查的额外启动，不是跨轮常驻。不能宣称已消除每轮冷启动。

本机 CLI 生成的协议包含 `thread/unsubscribe`，没有 `thread/unload`；[上游问题](https://github.com/openai/codex/issues/21889)说明取消订阅不等于立即卸载。直接保留进程再启动预测或其他接管 writer 会破坏现有释放约束。跨轮复用仍需统一线程所有权、预测及配置变化后的重建，尚未实施。

已有 RPC 诊断只记录成功恢复及失败，遗漏成功但缓慢的 initialize、config/read 和 skills/list。本次补齐这些启动阶段以及 MCP 状态读取的起止日志，保留 elapsedMs、timeoutMs 和会话关联，不写入返回的配置、技能正文或凭据。普通轮询成功不记日志。目标是加载后按阶段测量，不能将此诊断补充称为冷启动性能已修复。

## MCP 连接关闭复查

17:09:07 日志显示会话 970d3d0f 的 thread/resume 在 54.279 秒后失败，随后原生启动器退出码为 1；当次日志未保存足够细的失败分类，不能断言 Forge bridge 崩溃或公网故障。旧重试提示把匹配到的所有 MCP 初始化错误都称为“连接关闭”，路径存在和 buildId 只能证明入口存在，不能证明依赖与握手成功。

当前采用官方默认 JSON-RPC stdio（[官方说明](https://openai.com/index/unlocking-the-codex-harness/)）。Sidecar→App Server 和 App Server→Forge MCP 是两段独立本机管道；模型网络请求是另一段链路。Forge bridge 只在工具实际调用时请求后端，初始化不请求外网。没有证据表明换 WebSocket 能改善该故障，本次不引入常驻共享宿主或改变认证隔离。

本次修正超时/管道关闭/未知失败分类，将路径和构建诊断留在日志；模块缺失、语法错误等永久配置故障不再进行启动重试或 SDK 回退。bridge 就绪和未捕获异常记录 PID、存活时间及错误类型，使用 stderr，不污染协议 stdout、不输出凭据。不修改必要 MCP 规则，不重放已接受任务。

真实 SDK stdio 客户端同时启动三个 bridge，后端固定为不可达 127.0.0.1:1，仅握手及读取工具目录，耗时分别 508、578、509 毫秒，均成功；没有调用业务接口或模型。36 项相关回归、TypeScript 编译及质量门禁通过（运行门禁仍仅 /api/tools 200）。现场瞬态故障未复现，代码未重启加载；加载后仍需观察原生宿主及 bridge 日志，不能宣称连接故障已根除。

## 2026-11-23 调查与修复

用户报告 App Server initialize 60 秒超时、Skill 初始化反复等待。不能仅凭超时归因为网络。

- 后端日志记录多个 model/list 在 initialize 阶段超时，尚未发送模型目录请求。历史 Skill 前置探测也有首次 initialize 超时、清理后重试接近 60 秒才完成的记录。这些证明本地原生宿主没有及时完成握手，但不足以判断其内部慢在网络、插件加载还是系统负载。
- App Server 轮次原先先启动元数据进程读取 skills/list 和 config/read，再关闭并冷启动任务进程。现改为同一进程完成初始化、Skill 选择及线程启动；SDK/Exec 保留原独立探测。不会删除用户 MCP、改变认证、缓存过期账号配置或跳过必要的 Skill 校验。

## 验证与运行边界

- Sidecar 类型编译及 42 项定向回归通过：单进程新建/恢复、项目优先、无效结构化配置拒绝、取消、回退及进程清理。
- 质量门禁 status=PASSED、exit 0，executedCheckers=[]、executedVerifiers=[API-RUNTIME-001]；运行项仅证明当前 /api/tools 返回 200。
- 服务未重启，本次代码尚未完成目标版本运行验收。原生宿主单次 initialize 的底层慢因仍待目标版本日志及实际复测；不能将减少一次冷启动报告为外部宿主故障已完全恢复。
