## ADDED Requirements

### Requirement: Stable requirement specification agent contract
系统 SHALL 以 `requirement-specification` 稳定标识登记需求规格分析 Agent，并由其编排草稿证据探索、核心规格生成和 OpenSpec 产物同步。

#### Scenario: Specification agent is inspected in governance
- **WHEN** 管理员打开 Agent 管理
- **THEN** 系统展示需求规格分析 Agent 的版本、Prompt 引用、Graphify/OpenSpec/源码证据能力和回归样例

### Requirement: OpenSpec plan synchronization is deterministic
核心规格确认后，系统 SHALL 由规格编排器同步 OpenSpec proposal、specs、design 和 tasks，并执行严格校验；不得登记独立的执行计划 Agent。

#### Scenario: Core specification is confirmed
- **WHEN** 核心规格通过服务端契约校验
- **THEN** 同一规格运行进入 OpenSpec 同步与校验阶段，并产生可追踪的计划任务

### Requirement: Agent node runs are observable and idempotent
需求中枢 SHALL 展示两个 Agent 各节点的运行状态、引擎、阶段、进度、时间、错误与下一动作；同一输入已有活动运行时 MUST 复用原运行而不是重复启动。

#### Scenario: User revisits a running requirement
- **WHEN** 规格或进度 Agent 的节点仍处于 QUEUED、RUNNING 或 VALIDATING
- **THEN** 页面恢复该节点状态并禁用重复执行入口，同时允许用户查看运行详情

#### Scenario: Agent node fails
- **WHEN** 后台节点进入 FAILED
- **THEN** 页面展示可读错误摘要和可重试下一动作，且保留原运行标识用于审计
