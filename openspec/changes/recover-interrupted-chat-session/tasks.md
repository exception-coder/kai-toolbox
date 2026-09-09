## 1. Implementation

- [x] 1.1 集中恢复判定与发送前恢复，序列化重载并保留失败状态。
- [x] 1.2 状态栏提供恢复与重新检查。

## 2. Verification

- [x] 2.1 回归状态矩阵与服务并发恢复。
- [x] 2.2 前端类型检查和 Forge 质量门禁，记录实际结果。

验证：SessionRuntimeStateServiceTest 10 项、ClaudeChatSessionRecoveryTest 7 项、TurnLifecycleCoordinatorTest 3 项通过；前端 typecheck 通过。Forge exit 0、PASSED；executedCheckers 为空，仅执行 9 个既有 API-RUNTIME-001 场景，不是本功能在线验收。未重启后端，未运行真实会话恢复端到端验证。
