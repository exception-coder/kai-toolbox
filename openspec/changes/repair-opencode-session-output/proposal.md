## Why

OpenCode 会话可能完成却不显示助手回答，且既有会话缺少模型选择，导致用户无法确认或调整实际使用的模型。

## What Changes

- 用 OpenCode `prompt` 的权威响应补齐遗漏的流式文本；空回答明确失败。
- 在既有会话配置中提供 OpenCode 模型选择和目录刷新。

## Capabilities

### New Capabilities

- `opencode-session-output`: OpenCode 轮次输出恢复与会话模型操作。

### Modified Capabilities

- 无。

## Impact

仅修改 Sidecar OpenCode 适配器及 Vibe Coding 会话配置；不涉及数据库、架构职责或新服务。
