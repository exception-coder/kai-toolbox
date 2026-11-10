## Why

业务咨询步骤的规则和能力装配写在代码中，管理员无法调整查询策略。需要在现有 Agent 版本治理内管理流程节点，使配置实际进入咨询运行时。

## What Changes

- 将咨询流程拆成可编辑、启停、排序的节点，配置触发条件、执行规则、查询约束、输出要求及 Tool/MCP。
- 配置随候选版本保存和发布；会话冻结配置，追问不受后续发布影响。
- 运行时使用启用节点的能力并集，并与现有只读及系统授权取交集。
- 内置数据库证据自动补查规则；能通过工具查询的信息不反问用户。

## Capabilities

### New Capabilities

- `consult-workflow-configuration`: 咨询节点编辑、版本化和实际装配。

### Modified Capabilities

无。

## Impact

tool-fore-consult 的编排与版本仓储、toolbox-llm 的运行配置 SPI、claude-chat 消息装配、sidecar 双引擎能力裁剪，以及 agent-management 页面。复用现有权限、发布门禁和只读连接器，不增加独立子 Agent 或任意脚本执行。
