## MODIFIED Requirements

### Requirement: Forge 显式绑定并展示 OpenSpec Execution Context
严格 OpenSpec 自动推进运行 MUST 显式绑定当前会话、已校验项目根目录、仓库与分支快照、OpenSpec change、当前 task、执行阶段、Agent session 和运行代次。Forge MUST 在派发 task 前记录 `currentTaskId`，不得从 Agent 自然语言回复推断当前 task 或 change。明确验证组允许 Runtime 将当前 task 作为锚点，派发同一权威快照内有界的关联本地任务批次。

#### Scenario: 用户绑定活动 change
- **WHEN** 用户为标准开发会话选择项目中的一个活动 OpenSpec change 并启用严格自动推进
- **THEN** 系统校验项目路径和 change 身份后持久化版本化 Execution Context
- **AND** 页面展示项目、分支、change、绑定 specs、当前阶段和任务进度

#### Scenario: Forge 派发当前 task
- **WHEN** Runtime 选择一个可执行 OpenSpec task
- **THEN** 系统先持久化该 task 的人类可读 checklist key、OpenSpec apply 序号、change revision、尝试次数和运行代次，再向原 Agent session 派发
- **AND** 重连、回放或重启不能把其它 pending task 误认为当前 task
- **AND** 存在适用验证组时，交接指令列出同轮授权的精确任务 ID，保留当前 task 锚点和逐项验收

#### Scenario: 当前 task 在回合结束后仍未完成
- **WHEN** Agent 回合结束且绑定 `currentTaskId` 在权威 OpenSpec task 状态中仍未勾选，同时不存在允许暂停的 blocker
- **THEN** Runtime 继续派发同一 task，并根据最新快照重新投影适用验证组，不跳过未完成锚点
- **AND** 不根据回复中的“下一阶段”或“后续可以”改变 task 身份

#### Scenario: 当前 task 完成后选择下一项
- **WHEN** Runtime 重新读取后确认当前 task 已勾选且 change 仍有 pending task
- **THEN** 系统按 OpenSpec apply 返回顺序选择首个未完成 task，并在派发前持久化其身份
- **AND** 不创建或读取平行的 Forge task 清单来覆盖 OpenSpec 顺序

#### Scenario: 执行上下文发生漂移
- **WHEN** 项目、仓库、分支、change 或 Agent session 与持久化 Execution Context 无法安全对应
- **THEN** 系统暂停并标记 `EXECUTION_CONTEXT_DRIFT`
- **AND** 展示重新绑定、重试或终止动作，不自动猜测替代 change

## ADDED Requirements

### Requirement: Runtime dispatches explicitly grouped local development tasks
Runtime SHALL project a bounded batch of at most six contiguous local tasks sharing an explicit VERIFY_GROUP marker from the current change revision and bound current task. It MUST preserve per-task acceptance and writer authorization.

#### Scenario: Related tasks share a verification boundary
- **WHEN** the current pending task and following local tasks share the same group in the authoritative snapshot
- **THEN** Runtime includes their exact IDs in the persisted handoff so the Agent can implement them before shared verification
- **AND** tasks are checked only after their acceptance has supporting evidence

#### Scenario: A grouping boundary or context mismatch occurs
- **WHEN** a manual task, different group, stage change, stale revision or bound task mismatch is encountered
- **THEN** Runtime does not authorize work across that boundary

### Requirement: Repeated local verification distinguishes reused evidence
Forge SHALL reuse successful regression, spec and design checks only within the same execution and unchanged complete input fingerprint for an identical command, arguments, kind and working directory. It SHALL expose executed and reused check IDs separately.

#### Scenario: An unchanged successful local check is requested again
- **WHEN** all reuse conditions match and force is false
- **THEN** Forge returns the original evidence without launching the command again

#### Scenario: Fresh execution is required
- **WHEN** force is true, inputs changed, the check failed, or its kind is API, SQL or UI
- **THEN** Forge executes the command and records its actual result
- **AND** incomplete, stale and failed verification continues to block delivery
