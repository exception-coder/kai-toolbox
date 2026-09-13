## Why
咨询节点已可配置，但查询仍依赖专用数据库配置，与统一资源中心脱节。

## What Changes
- 节点保存允许的资源绑定 ID，提供资源目录选择与源配置入口。
- 新增咨询专用资源发现、只读查询工具，复用统一资源服务。
- 根据会话源码目录精确解析系统，冻结绑定选择，每次调用重新校验状态。

## Capabilities
### New Capabilities
- `consult-system-resources`: 咨询资源配置与只读执行。
### Modified Capabilities

## Impact
fore-consult、ops、common、projects、Claude/Codex sidecar 与 Agent 管理；无新增凭据存储。
