# Execution 模块维护

整体职责以 [AI 编程架构](../../../../docs/ai-coding-architecture.md) 为准。本目录实现执行上下文与策略；不拥有正式规格、图谱或宿主任务清单。

| 文件 | 维护内容 |
|---|---|
| `contracts.ts` | 会话、候选查询、判定、生命周期事件、验证的输入结构 |
| `context.ts` | 复用规格索引和 Graphify，提供只读候选与可持久化 discovery |
| `session.ts` | 能力探测边界、执行/任务引用和写入归属的只读投影 |
| `policy.ts` | 行为/设计/验证映射与共享分支规则，不依赖宿主 SDK |
| `repository.ts` | Git 根、分支、文件摘要与路径边界 |
| `service.ts` | 影响判定绑定、范围与分支检查、提交后结束 |
| `lifecycle.ts` | 宿主统一 WRITE/COMMIT/STOP/GIT 路由与策略结果 |
| `verification.ts` | 实际执行检查及保存输入指纹 |
| `guard.ts` | 原生权限载荷适配，消费 lifecycle 决策 |
| `tools.ts` | MCP/SDK/CLI 共用的执行工具定义 |

依赖方向：宿主适配 → lifecycle/service → policy/repository/规格服务。规格检索实现仍在 `specResolution/`，注册层组合两者。历史 `specResolution/execution*.ts` 为兼容导出，勿在其中添加实现。

`session_init` 和 `resolve_execution_context` 不写文件，也不要求已知实施范围。准备实施时保留 `discover_execution → assess_execution → check_execution_readiness → run_execution_verification → finish_execution`。现有状态路径、schemaVersion 1、哈希和锁不迁移；新增可选 taskId 引用不升级已有验证。若原会话漏调 `finish_execution`，后续绑定只会在旧执行已验证、已提交、同分支且执行与 Change 范围干净时原子回收 writer，并在旧记录中留下审计；无法证明完成时继续阻断。

`check_execution_event` 的协议版本为 2：返回 allowed、code、enforcement、governanceBackend、legacyGovernanceRequired。已绑定执行拒绝为 block；旧规格路径使用 legacyMode。没有收到有效结果时，由适配器执行明确的传输故障策略，不能读取私有状态猜测当前绑定。

验证复用旧执行/规格专项，并增加 `lifecycle.test.ts` 的只读、恢复、第二写入者、分支、范围、Stop 与错误协议场景。真实宿主加载和触发仍需单独记录，模块测试不提供该证明。
