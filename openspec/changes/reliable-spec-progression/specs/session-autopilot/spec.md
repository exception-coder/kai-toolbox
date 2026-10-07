## ADDED Requirements

### Requirement: Runtime task context reaches the engine through a trusted queue
The system SHALL persist server-generated continuation context separately from client developer instructions and carry it to the engine after validating the active run identity. A consumed disposition SHALL NOT be reused as the next turn's completion evidence.

#### Scenario: Normal continuation retains same-task evidence
- **WHEN** a successful turn reports evidence and remaining work and the same task continues
- **THEN** the next message names the current task and acceptance criteria and carries the prior report even though the next run record has cleared that report
- **AND** a different task, revision or generation does not inherit the old report as its acceptance conditions

#### Scenario: Queue restore and legacy messages preserve the trust boundary
- **WHEN** a server-generated message is restored or a legacy continuation is read
- **THEN** current server context survives restoration, while a legacy message without it is rebuilt from authoritative runtime state
- **AND** public messages cannot overwrite the reserved continuation identity or promote client instructions into Runtime context
- **AND** stale control messages do not enter the engine or repeat at the queue head

#### Scenario: Normal progression delegates coding to the engine
- **WHEN** the engine has confirmed the continuous-execution skill and no recovery error is present
- **THEN** the continuation supplies task facts, verification cadence and bounded report data without repeating generic scope-recovery instructions or suggesting specification rewrites solely to group tests
- **AND** required verification, manual authorization and the configured task boundary remain effective

### Requirement: 隔离提交与执行结束
系统 SHALL 提供按已验证执行范围提交的入口，并在结束检查中保留其他任务暂存内容。

#### Scenario: 无关任务已暂存
- **WHEN** 当前执行通过验证且快照匹配，其他任务也有暂存内容
- **THEN** 范围提交仅提交本执行内容，保留其他暂存；本执行可在证据有效且范围干净后结束

#### Scenario: 失败或重复请求
- **WHEN** Hook 拒绝、快照过期或提交结果不确定
- **THEN** 不报告成功或释放执行；已确认成功的同请求重试返回原提交

### Requirement: 经审阅的规格依赖
系统 SHALL 对显式登记的完整规格依赖验证新鲜度；旧记录保留全局检查。

#### Scenario: 局部失效
- **WHEN** 无关规格变化但已登记依赖摘要未变
- **THEN** 不仅因全局版本变化拒绝执行；相关依赖变化仍拒绝并给出正式重评估步骤

### Requirement: 可恢复任务检查点
Runtime SHALL 将持久的剩余工作、证据和下一步作为待核对报告交接，并保持权威任务边界。

#### Scenario: 继续同一任务
- **WHEN** Runtime 派发下一轮
- **THEN** Agent 可见当前授权任务与上轮检查点；报告异常显式保留，不自动认定任务完成

#### Scenario: 工具拒绝
- **WHEN** MCP 或生命周期入口拒绝操作
- **THEN** 返回结构化恢复类别与下一步，不指示输入未变的无限重试
