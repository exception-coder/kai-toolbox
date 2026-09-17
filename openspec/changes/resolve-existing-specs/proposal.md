## Why

开发 Agent 缺少统一的 Requirement 级找回、确认与防重复检查，容易把存量能力再次写成新规格。专家方案提供设计输入，本次交付本地 Forge MCP 与跨宿主薄 Hook 的可验证闭环。

## What Changes

- 检索正式规格中的 Requirement/Scenario，返回证据、候选和 Graphify 关联。
- 保存按项目、change、分支、输入与规格版本绑定的幂等解析和具名 Agent 决策。
- 检查确认、Delta、重复目标、并行冲突及过期；只输出草稿，不直接写正式规格。
- SDK/stdio MCP 与 Hook CLI 复用同一用例；模型负责原子化和语义判断，确定性规则负责校验。

## Capabilities

### New Capabilities

- `spec-resolution`: 已有规格找回、决策审计与实施就绪检查。现有 openspec-task-board 只读看板不承担此职责。

### Modified Capabilities

无。

## Impact

sidecar/claude-agent 的 Forge 工具适配；team-standards 的写前和提交 Hook。无需数据库迁移或新增依赖。服务运行验收须另获本次重启授权，代码验证使用隔离输出。
