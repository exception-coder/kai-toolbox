## Why

Vibe Coding 中 Codex 使用 `cua_repl` 操作流式更新页面时，会继续使用旧快照中的节点编号，导致 `Node is detached from document` 连续失败。失败卡片又只显示通用文案，使用户无法判断原因或确认后续调用是否已经恢复。

## What Changes

- 向可使用浏览器工具的 Codex 开发会话注入动态节点恢复约束。
- 对动态节点失效生成可操作的活动标题，并在同工具后续成功时标记自动恢复。
- 保留真实、脱敏后的工具输出供展开诊断。

## Capabilities

### New Capabilities

- `cua-dynamic-node-recovery`: 规定动态页面节点失效后的单次重新定位、重试和用户可见状态。

### Modified Capabilities

（无）

## Impact

影响 `sidecar/claude-agent` 的 Codex 开发会话提示组装和 App Server MCP 活动映射。不修改 `cua_repl` 插件、浏览器运行时、数据库或公开 API。

证据来源为 Codex rollout 中的 `-32000 / Node is detached from document` 工具结果，以及 `codexEngine.ts`、`codexAppServer.ts`、`useClaudeChatSocket.ts` 的当前实现。

未决事项：无。
