# Execution 模块维护

整体职责以 [AI 编程架构](../../../../docs/ai-coding-architecture.md) 为准。本目录实现执行上下文与策略；不拥有正式规格、图谱或宿主任务清单。

| 文件 | 维护内容 |
|---|---|
| `contracts.ts` | 会话、候选查询、判定、生命周期事件、验证的输入结构 |
| `context.ts` | 复用规格索引和 Graphify，提供只读候选与可持久化 discovery |
| `session.ts` | 能力探测边界、执行/任务引用和写入归属的只读投影 |
| `policy.ts` | 行为/设计/验证映射与共享分支规则，不依赖宿主 SDK |
| `writers.ts` | 模块与共享文件范围、活跃写入索引和旧指针兼容 |
| `repository.ts` | Git 根、分支、文件摘要与路径边界 |
| `service.ts` | 影响判定绑定、范围与分支检查、提交后结束 |
| `lifecycle.ts` | 宿主统一 WRITE/COMMIT/STOP/GIT 路由与策略结果 |
| `verification.ts` | 实际执行检查及保存输入指纹 |
| `guard.ts` | 原生权限载荷适配，消费 lifecycle 决策 |
| `tools.ts` | MCP/SDK/CLI 共用的执行工具定义 |

依赖方向：宿主适配 → lifecycle/service → policy/repository/规格服务。规格检索实现仍在 `specResolution/`，注册层组合两者。历史 `specResolution/execution*.ts` 为兼容导出，勿在其中添加实现。

`session_init` 和 `resolve_execution_context` 不写文件，也不要求已知实施范围。准备实施时保留 `discover_execution → assess_execution → check_execution_readiness → run_execution_verification → finish_execution`。执行绑定按最近的构建清单目录计算源码模块范围；设计文档按文件、OpenSpec 按 Change 或 capability 占用；根构建文件、迁移和无法定位模块的路径全局互斥。同模块或相同共享目标互斥，不同模块可并行。旧 `execution-writer` 指针按全局占用兼容；新执行写入 `execution-writers` 索引，原执行记录与会话绑定不迁移。若原会话漏调 `finish_execution`，后续绑定只会在旧执行已验证、本执行路径已提交、同分支且执行与 Change 范围干净时原子回收 writer，并留下审计。

原会话丢失时先调用 `inspect_execution_writer` 查看 `writers`，核对目标执行 ID、原会话、分支、HEAD 及范围状态。确认不再继续该执行后，使用 `abort_execution` 提交上述身份、具名 actor 和原因；它会在同一状态锁内复核并记录 `ABORTED`，保留原记录和工作文件，只释放目标执行及会话指针。上下文变化需重新查询，不能按超时或通过删除状态文件接管。

`check_execution_event` 的协议版本为 2：返回 allowed、code、enforcement、governanceBackend、legacyGovernanceRequired。已绑定执行拒绝为 block；旧规格路径使用 legacyMode。没有收到有效结果时，由适配器执行明确的传输故障策略，不能读取私有状态猜测当前绑定。

验证复用旧执行/规格专项，并增加 `lifecycle.test.ts` 的只读、恢复、第二写入者、分支、范围、Stop 与错误协议场景。真实宿主加载和触发仍需单独记录，模块测试不提供该证明。

## 写入恢复与内部锁

`inspect_execution_writer` 返回 `scopeFingerprint`；显式中止必须传 `expectedScopeFingerprint`，防止 HEAD 未变但文件内容变化时释放未经审阅的现场。分支漂移时 `branch` 保留执行分配分支，`expectedCurrentBranch` 指定查询所得当前分支（detached 为字符串空值），恢复不切换分支。

完成检查和释放在同一内部事务内执行。COMPLETED、ABORTED、AUTO_RECLAIMED 是不可恢复为活动态的历史；再次工作建立新执行。终态已写入但指针尚未清理时，下次绑定在锁内续完释放。

内部互斥使用 Node 22.13+ 的内置 SQLite 排他事务，仅用于互斥，不迁移 JSON 业务记录。进程退出由操作系统释放锁；新版 marker 遗留由下一次事务恢复。旧版空锁不能推断持有者：先 `inspect_store_lock`，由操作者确认所有旧版写入进程已停止，再用查询摘要、actor、reason 和 `legacyProcessesStopped: true` 调用 `recover_store_lock`。原锁归档、审计保留，任务写入权不受此操作影响。服务重启仍须单独授权。持有者活跃时有限等待后返回 SPEC_STORE_BUSY，不能无界重试。

## 分批验证的结果与恢复

- `PASS`：已声明检查与必需类别均完成；提交仍需 check_execution_readiness。
- `VERIFICATION_PENDING`：本批没有失败，尚有 missing 类别或 pendingChecks。MCP 调用成功，但 allowed=false，不允许提交。保持同一完整 inputFiles，仅补齐剩余项。
- `VERIFICATION_FAILED`：真实失败详见 results.diagnostic；保留失败 checkId。无关批次通过不会清除失败。原命令重试通过可更新证据；更换命令须用同类别 `replaces` 引用失败 checkId，替代检查实际通过后解除阻断。

cwd 与 inputFiles 接受项目内绝对路径和相对路径，仍拒绝越界和符号链接。整批预检目录与已知命令适配，避免路径错误出现在先前检查已执行后。Windows openspec/npm/npx 使用本地已安装包的 Node 入口，不执行 .cmd Shell，不自动安装工具。purpose 接受非空简短说明；inputFiles 始终必填。

每项超时上限120秒；整次执行实际预算4分钟，超出预算的未启动检查返回 pendingChecks，持久化后必须完成才能提交。已启动命令仍受剩余调用预算约束。验证进度与取消机制不变。
