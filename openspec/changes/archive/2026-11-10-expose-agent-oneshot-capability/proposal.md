## Why

业务模块已有一次性 Agent 执行 Bean，但公共入口缺少简洁调用、命名参数构建与明确支持边界，调用方容易复制长位置参数或误把持续会话能力当作一次性能力。用户已确认复用现有实现并暴露为公共能力。

## What Changes

- 在现有 AgentOneShotRunner 上提供简单文本调用、流式调用和请求 builder。
- 在实际执行入口校验必填提示词，公开真实支持的引擎；保留现有方法与构造器兼容性。
- 发布模块接入文档，说明 Bean 装配、线程、认证、错误、工具策略和一次性执行边界。
- 不增加 HTTP/MCP 入口，不更换框架，不增加持久会话或 OpenCode 一次性适配。

## Capabilities

### New Capabilities

- `agent-oneshot-capability`: 跨工具模块通过公共 Spring Bean 执行一次性 Agent 文本任务。

### Modified Capabilities

无。

## Impact

影响 toolbox-llm 公共 SPI、tool-claude-chat 实现及相关测试、模块 README 与文档索引。无新依赖、数据库迁移或前端变化。证据来自当前源码 AgentOneShotRunner、AgentOneShotService 与 Sidecar sessionManager；现有一次性实现只接受 Claude、Codex。无待决业务选择。
