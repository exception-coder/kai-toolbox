## Why

中断会话被只允许 IDLE 的门禁永久拦住，状态栏却建议无需校正。需要确认旧任务清理完成后恢复发送。

## What Changes

- 新鲜且无活动的中断会话在发送前恢复空闲，复用会话锁。
- 手动重载与发送串行，拒绝活动任务、待确认和后台任务。
- 状态栏提供重新检查和恢复入口，不自动重放历史消息。

## Capabilities

### New Capabilities

- `interrupted-session-recovery`: 中断会话的安全恢复与发送保护。

### Modified Capabilities

无。

## Impact

影响 ClaudeChatService、SessionRuntimeStateService 和 SessionRuntimeHealth。无 DDL、依赖或原生会话 ID 变更；不重启服务、不重放业务操作。依据既有故障记录和定向源码；无未决业务选择。
