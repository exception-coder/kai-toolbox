## Why

AI 对话与 Vibe Coding 使用相邻独立入口，但用户希望按控制模式选择直接模型对话或 Code Agent，同时保护现有开发能力。

## What Changes

- 在 Vibe Coding 内提供控制模式选择，默认 Code Agent，纯 LLM 复用原 AI 对话历史、模型与流式能力。
- 原 AI 对话入口兼容跳转，不再占用独立功能菜单。
- 服务端保持两个模块、会话存储和执行通道独立，纯 LLM 请求显式校验控制模式，不执行模型工具请求。
- **BREAKING**: 原 AI 对话的自动工具循环移除，成为纯 LLM；Code Agent 的工具、权限和执行契约保持原状。

## Capabilities

### New Capabilities

- `chat-control-modes`: 单入口控制模式切换、会话隔离、纯模型执行与 Agent 兼容。

### Modified Capabilities

无。

## Impact

frontend ai-chat/claude-chat 公开组件与路由，ChatRuntime 的懒激活判定；tool-ai-chat 请求策略及流式服务。无工具模块相互依赖，无数据库迁移，不修改 Code Agent 后端和 SDK。既有纯模型图片/视频能力保留。外部真实付费模型调用不作为自动回归前提，以可控模型响应与 HTTP 冒烟验收。
