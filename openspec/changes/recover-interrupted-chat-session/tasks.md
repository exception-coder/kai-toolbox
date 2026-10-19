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

## 4. 中断长期等待恢复（2026-10-17）

- [x] 4.1 移除不收敛执行的假终态计时器，30 秒后提示待确认并恢复终止重试；等待期间维持运行锁。
- [x] 4.2 Codex 协议清理后保留受管进程重试入口，匹配当前所有权，确认退出后移除，不影响其他会话。
- [x] 4.3 中断覆盖未发布的成功结果并保留 usage，暂停队列；覆盖取消、清理、迟到结果与切会话回归。
- [x] 4.4 完成隔离 Sidecar 编译、定向测试、前端类型检查及规格/质量门禁。
- [ ] 4.5 用户确认加载新版本后，验证真实会话终止、日志与至少 60 秒稳定观察。

本次验证：Sidecar TypeScript 编译退出 0（独立测试目录，未覆盖运行中的 dist），39 项定向测试通过；前端 20 项定向测试通过，typecheck（含菜单目录与 Feature boundaries）通过；OpenSpec strict 通过；Forge JSON status=PASSED、exit=0，executedCheckers 为空，仅执行 9 个既有 API-RUNTIME-001 场景，不代表本次终止链路已在线验收。未重启、未推送；浏览器动态验证未完成，不将模拟进程回归声称为真实 Codex 业务会话验收。第 3 节的历史运行证据不适用于本次新代码。

## 5. SDK 终态与进程退出确认（2026-10-19）

- [x] 5.1 记录指定会话完成事件、中断回执与仍活动的运行快照，区分已验证缺口与尚未还原的历史底层原因。
- [x] 5.2 SDK 收到原生终态后结束迭代，按本次调用持有的原生进程确认退出，再发布结果；停止重试覆盖 SDK，缺证据保持队列保护。
- [x] 5.3 使用真实 SDK 与本地管道夹具覆盖终态后无 EOF、取消、失败、并发会话隔离及监听移除，回归 App Server 和轮次门禁。
- [x] 5.4 核对最终 Sidecar 编译、定向回归、规格及 Forge 质量门禁，记录实际结果。
- [ ] 5.5 用户确认重启后，验证目标会话停止、队列保留、运行日志及至少 60 秒稳定观察。

本次仅修改 Sidecar 适配与相关说明，不修改前后端公开消息格式、SQLite 或前端交互。隔离测试不覆盖真实模型、账号和用户会话；既有运行进程未重启，新版尚未运行验收。

验证：完整 Sidecar TypeScript 源码编译到独立测试目录，exit=0；55 项定向回归通过，其中 6 项为真实 SDK/本地进程测试，含旧 EOF 等待的复现、修复后成功/失败收口、取消、并发会话停止隔离及缺少所有权证据拒绝。复用并执行 App Server 生命周期、进程释放、轮次完成/中断与启动重试用例；补充 SDK 移除监听后的信号退出与 launcher 保护回归。OpenSpec strict 与 diff 检查通过；Forge JSON status=PASSED、exit=0，executedCheckers 为空，实际执行 9 个既有 API-RUNTIME-001 场景，不代表本次新 Sidecar 或指定会话已在线恢复。未覆盖运行中的 dist，未重启服务。
