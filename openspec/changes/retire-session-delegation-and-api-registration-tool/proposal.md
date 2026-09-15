## Why

范围更正（用户确认，2026-09-15）：彩虹胶囊只读咨询需要保留，不能随会话委托删除。独立接入修复与验收见 [restore-capsule-relay-without-delegation](../restore-capsule-relay-without-delegation/proposal.md)；下文 Session Client/Relay 退役仅指委托协议，不包括胶囊兼容路径与宿主身份配置。

会话委托、公共 Session Client/Relay SDK 与接口人工登记形成了两套额外控制面，但当前产品只需要所有者直接使用受约束的 Vibe Coding 会话，并由 OpenSpec 记录接口契约。继续保留这些入口会扩大安全面、维护成本和用户认知负担。

## What Changes

- **BREAKING**：移除 Vibe Coding 的“委托”页签、参考 Client、公共 Session Client/Relay REST 与 WebSocket 协议以及客户端 SDK/服务端 Starter。
- **BREAKING**：移除 Forge `register_affected_apis` Agent Tool、会话级接口登记 HTTP 契约和 OpenSpec 看板中的独立接口证据投影。
- OpenSpec proposal/spec/design/tasks 继续作为接口设计、实现范围和验收证据的唯一需求来源。
- 保留既有 SQLite 历史表和数据，不自动执行破坏性 DROP；新安装不再创建退役表。

## Capabilities

### New Capabilities

- `vibe-coding-capability-boundary`: 定义 Vibe Coding 只保留所有者会话与 OpenSpec 驱动执行，不再提供会话委托或外部 Relay 接入。

### Modified Capabilities

- `openspec-task-board`: 移除独立 affected API 登记与看板投影，接口契约直接由 OpenSpec artifacts 表达。

## Impact

- 前端：Vibe Coding、Forge Explore、OpenSpec 看板及 Session Client SDK 构建入口。
- 后端：tool-claude-chat 委托/Relay/affected API Controller、服务、仓储、配置与 WebSocket 注册。
- Sidecar：Forge MCP Tool 目录、强制 steering 和委托专用执行策略连接点。
- 构建：移除 Spring Boot Relay Starter Maven 模块及前端 Session Client 包。
- 兼容性：原委托与 affected API HTTP/WS 路由不再提供；调用方应停止接入，接口说明转入对应 OpenSpec change。
