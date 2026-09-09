## ADDED Requirements

### Requirement: Multiple agents are registered and selectable
Agent 管理 SHALL 展示所有已登记 Agent，并允许管理员按稳定 Agent 标识选择详情。

#### Scenario: Registry contains multiple agents
- **WHEN** 业务咨询 Agent 和需求进度分析 Agent 均已登记
- **THEN** 注册表显示两个独立条目且选择后加载各自详情

### Requirement: Version operations are scoped by agent
候选保存、发布和回滚操作 MUST 显式限定 Agent 标识，不得影响其他 Agent 的版本状态。

#### Scenario: Release requirement progress candidate
- **WHEN** 管理员发布需求进度分析 Agent 的合格候选版本
- **THEN** 仅该 Agent 的生产版本发生切换，业务咨询 Agent 保持不变

### Requirement: Legacy business consult route remains compatible
系统 SHALL 在通用多 Agent API 上线后继续支持既有业务咨询 Agent 管理路径。

#### Scenario: Existing client requests business consult snapshot
- **WHEN** 旧客户端访问既有业务咨询 Agent 路径
- **THEN** 系统返回与通用 Registry 中同一 Agent 的快照
