## Why

现有会话能力面板只保留 MCP 名称，无法核验 MCP 是否在当前会话真实连接、注入了哪些 Tool，也无法核对 Codex 插件的本地/远端版本及其 Skills。Codex App Server 已提供这些权威运行时目录，Forge 需要完整透传并用可审计的树结构展示。

## What Changes

- 扩展会话能力快照，记录数据来源、刷新时间、诊断信息以及 MCP 的运行状态、认证状态、服务版本和 Tool 清单。
- 通过当前会话绑定的 Codex Auth 目录和工作目录查询 `mcpServerStatus/list`、`plugin/list`、`skills/list`，并按插件归属合并 Skills。
- 在 Vibe Coding 中以 `MCP → Tools`、`Plugin → Skills` 和独立 Skills 三组树形结构展示当前会话能力。
- 明确区分 `运行时已验证`、`仅配置可见`、`查询失败`，避免把配置存在误判为 Tool 已注入。
- 为每项能力记录可审计来源与作用域，区分 Forge 会话注入、Auth 全局配置、Plugin 贡献、项目本地和引擎内建能力。
- 保持旧 Sidecar 和 Claude SDK 初始化字段兼容；无法取得完整目录时展示可恢复的降级状态。

## Capabilities

### New Capabilities

- `session-capability-diagnostics`: 定义当前会话 MCP、Tools、Plugins 和 Skills 的权威查询、兼容降级与诊断展示行为。

### Modified Capabilities

（无）

## Impact

- Sidecar：Codex App Server 能力目录查询、会话能力快照与初始化事件。
- Java：WebSocket `ready` 消息的兼容扩展和会话内能力快照缓存。
- 前端：会话能力类型、Socket 状态和树形诊断面板。
- 依赖：复用已安装 Codex App Server，不新增第三方依赖。
