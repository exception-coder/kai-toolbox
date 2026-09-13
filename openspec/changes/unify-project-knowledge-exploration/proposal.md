## Why

项目库已经拥有带源码引用校验的业务域探索，但知识图谱入口仍要求分别维护业务真理和跨项目拓扑目录，登记完整度容易被误读为知识可信度。统一探索与查询，保留已有知识和评审语义。

## What Changes

- 项目库统一业务知识与跨项目关系入口，复用 Graphify 定位及源码引用校验。
- 新增显式选择已登记项目的跨项目探索，按项目取证再归纳关系，失败保留上一版。
- 增加只读 knowledge_query MCP 工具，统一查询两个既有知识库，保留旧名称兼容。
- 移除项目卡片的六类／四类文档初始化流程；展示候选与过期证据，不自动确认业务规则。

## Capabilities

### New Capabilities

- `project-knowledge-exploration`: 统一探索、跨项目证据快照与只读知识查询。

### Modified Capabilities

无。原业务域 API、快照与知识库读取保持兼容。

## Impact

影响 tool-projects 领域探索、project-workspace 知识入口与 claude-agent 只读 MCP。无数据库迁移，无新增跨工具依赖，不合并或删除知识仓库，不升级 Graphify，不将源码推断晋升为已确认规则。依据为现有 DomainExplorationService、DomainResultValidator 与 knowledgeMcp；无未决破坏性操作。
