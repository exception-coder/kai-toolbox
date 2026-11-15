## Why

已有 ChatGPT 网页评审 CLI 缺少 AI 工具入口，单纯提示自动评审容易重复发送和无限优化。

## What Changes

- 复用 Forge SDK/stdio 桥接，提供异步 start/status/cancel。
- 绑定宿主会话并持久化一次自动提交预算及限频查询，不接受模型自选身份。
- 在前端设计技能中引导获授权的一次评审，随后本地实现验收。

## Capabilities

### New Capabilities
- `bounded-visual-review`: 有限次、可恢复的网页视觉评审工具。

### Modified Capabilities

None.

## Impact

仅 Sidecar Forge 工具装配、现有 Node CLI 及说明；无新数据库、前端页面、引擎或服务重启。真实账号链路仍待验收。
