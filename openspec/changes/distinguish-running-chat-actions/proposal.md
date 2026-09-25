## Why

Vibe Coding 当前将运行中的官方 Codex 纯文本自动补进当前轮，用户无法把后续任务明确排队；移动端甚至隐藏了该发送入口。用户需要在输入时知道消息将影响当前作业，还是等待下一轮。

## What Changes

- 在运行中的官方 Codex 会话同时提供“补充到当前轮”和“加入队列”，由用户显式选择；回车默认入队。
- 附件及不支持 steer 的引擎只提供队列；空消息、锁定计划不得发送。
- 主会话、分屏与悬浮窗采用一致行为，移动端保留可触及且有文字区分的操作。

## Capabilities

### New Capabilities

- `running-chat-actions`: 运行中消息的显式去向、可用条件和窄屏交互。

### Modified Capabilities

无。

## Impact

仅影响 claude-chat 前端三个输入区及其回归；复用现有 WebSocket steer 和持久化队列，不改变后端协议、Codex/Claude 路由或历史消息。
