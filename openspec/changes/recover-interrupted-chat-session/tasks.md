## 1. Implementation

- [x] 1.1 集中恢复判定与发送前恢复，序列化重载并保留失败状态。
- [x] 1.2 状态栏提供恢复与重新检查。

## 2. Verification

- [x] 2.1 回归状态矩阵与服务并发恢复。
- [x] 2.2 前端类型检查和 Forge 质量门禁，记录实际结果。

验证：SessionRuntimeStateServiceTest 10 项、ClaudeChatSessionRecoveryTest 7 项、TurnLifecycleCoordinatorTest 3 项通过；前端 typecheck 通过。Forge exit 0、PASSED；executedCheckers 为空，仅执行 9 个既有 API-RUNTIME-001 场景，不是本功能在线验收。未重启后端，未运行真实会话恢复端到端验证。

## 3. Writer cleanup regression

- [x] 3.1 将 Codex 队列释放终态延后到本轮 App Server 进程退出，并为自然退出与强制清理补充回归。
- [x] 3.2 移除 Java 中断固定超时伪终态，改为持续以 Sidecar 运行态和真实 result 收口。
- [x] 3.3 更新故障证据，执行 Sidecar、后端、OpenSpec 与 Forge 质量门禁并加载新运行产物。

验证：Sidecar 171 项测试通过，含 3 项进程释放回归；后端定向 13 项测试通过。OpenSpec strict 与 Forge Quality Gate 均 PASSED，Forge Runtime 实际执行 9 个既有 API-RUNTIME-001 场景。受控重启后新 dist 已包含释放门禁，18890、18080、5173 正常监听，`GET /api/tools` 返回 200；连续 60 秒观察期间后端 PID 未变、重启次数为 0、无致命启动日志。未向用户业务会话注入测试消息，真实“中断后立即发送”由确定性生命周期测试覆盖。
