## Why

Agent 运行与控制面板将状态指标与会话列表排在待发送队列之前；队列被挤到首屏之外，用户难以查看和处理待发送消息。

## What Changes

- 待发送队列固定在标题下方，不随操作和诊断区域滚动。
- 功能操作和会话切换优先，运行概览、执行明细和诊断在下面。
- 保留队列移除、清空、手动发送及暂停规则，仅调整布局。

## Capabilities

### New Capabilities

- `agent-dock-priority`: Agent 控制面板的队列与功能优先展示。

## Impact

仅影响 Vibe Coding 共享 Agent Dock 前端及相关测试。无数据库、后端、队列调度和 AI 架构契约变化。
