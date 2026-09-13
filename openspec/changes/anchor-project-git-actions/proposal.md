## Why

项目已有唯一列表，Git 操作页签却复制项目选择，增加导航与上下文恢复成本。用户要求改为对象内弹框，并参照 yoooni-one 建立结构化项目哲学。

## What Changes

- 全部项目的每个项目行提供 Git 操作弹框，取消顶层 Git 工作区页签和第二份项目列表。
- 保留既有 Git 状态、待 Commit/Push、快照推送与错误恢复；关闭后保留原项目列表状态。
- 增加项目产品/交互哲学及 Agent 路由，明确对象、动作、稳定视图和覆盖层的边界与验证方式。

## Capabilities

### New Capabilities

- `project-object-actions`: 已选项目中的 Git 操作与上下文恢复。
- `project-product-philosophy`: 可追溯、有适用范围和例外的项目设计约束。

### Modified Capabilities

无。既有 project-git-workspace 状态及 push API 契约保持。

## Impact

影响 ProjectRegistryPage、ProjectGitWorkspace 和新 Git 弹框，以及项目长期文档和 AGENTS 路由。无后端、数据库或权限变更。使用现有 Radix Dialog，无新依赖。仅参考 yoooni-one 文档，不修改其项目或全局设计核心。
