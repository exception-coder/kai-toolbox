## Context

SessionRuntimeStateService.assess 只允许 IDLE；ClaudeChatService.sendDelegatedUserMessage 已持有 ctx 锁，而 resumeCurrent 未加同一把锁。SessionRuntimeHealth 只展示一致性。

## Goals / Non-Goals

恢复已清理的中断会话，保留未知状态保护。不自动重放历史请求、不修改原生协议或停止其他会话。

## Decisions

状态服务集中判定可恢复性：Sidecar 可达、新鲜、会话存在、无活动/待确认/后台任务、Java 与持久化一致。发送在 ctx 锁内核对并将 INTERRUPTED 转 IDLE，清理旧生命周期；原 Sidecar 已空闲无需重建。显式重载也在同一锁内执行，先核对清理事实，重载后再次核对再标记空闲。相同会话请求不会交错启动。Sidecar 确认会话缺失且 Java 无任务时只允许显式重载；必须等重载后会话存在才能转空闲，发送不能直接跳过挂载。并发创建 Java 上下文使用 putIfAbsent 保持唯一锁。界面复用原重载动作，异常时提供重新检查。

Codex App Server 的 `turn/completed` 只代表业务终态，不代表 thread writer 已释放。Sidecar 必须先关闭本轮受管进程并确认进程退出，再发布允许上游释放队列的 `result`。自然退出超时后只终止本轮受管进程树并再次确认，不扫描或影响其他客户端。Java 中断协调器的超时动作只查询新鲜运行态，不再基于固定时长伪造终态；真正的 Sidecar `result` 仍是释放 Java 轮次的唯一事件。

## Risks / Trade-offs

- 查询失败：不更改中断状态，不发送消息，保留恢复按钮。
- 恢复期间新任务：同一 ctx 锁串行发送与重载；Sidecar 最终启动仍保留现有原子门禁。
- 重载可异步完成：重载后即时查询未就绪则不声称成功，允许重试。
- 原生进程清理较慢：会延后数秒显示本轮彻底结束，但不会把下一条消息送进仍持锁的 thread。

## Migration Plan

无数据迁移。测试状态矩阵、服务恢复与并发、前端类型检查及 Forge 门禁。部署需正常加载新后端；回滚仅撤回本次代码。

## Open Questions

无。
