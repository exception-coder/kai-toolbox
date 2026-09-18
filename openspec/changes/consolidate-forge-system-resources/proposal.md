## Why

Forge 已具备统一资源发现与执行入口，但 APP 账号仍按 ERP/SRM 固定配置，普通开发会话仍注入 `erp_db`、`srm_db` 等系统专属 MCP，导致新增系统或环境必须改代码。需要把多系统、多数据库和多应用账号收敛为可配置资源，并由 Forge 内置工具按当前系统动态发现。

## What Changes

- 在“系统资源与测试账号”中按项目库系统配置多个数据库连接和应用站点账号，凭据仅由服务端保存和使用。
- 通用 APP 资源支持环境、登录协议、受限请求目标和 `TEST/CALL` 能力；数据库继续复用现有多数据源与只读查询能力。
- Forge 内置 MCP 仅通过 `discover_resources` 和 `execute_resource` 暴露当前系统已绑定资源，不再按 ERP/SRM/SCM 增加工具名。
- 普通开发会话停止注入固定 `erp_db/erp_app/srm_db/srm_app/scm_db` MCP；旧 HTTP 配置与执行接口暂时保留兼容。
- 系统资源页将“源配置”和“系统关联”组织在同一系统上下文中，并提供配置、绑定、测试和错误恢复反馈。

## Capabilities

### New Capabilities

- `system-resource-configuration`: 多系统 DB/APP 资源配置、凭据保护、绑定以及 Forge 动态工具暴露。

### Modified Capabilities

## Impact

影响 `tool-ops` 的资源领域、API、SQLite schema 与 provider，`frontend/features/ops/resources` 的资源配置体验，以及 Sidecar 的 MCP 注册、会话能力与安全策略。新增 SQLite 表由应用启动时幂等创建，无人工执行 SQL；不迁移或删除旧 ERP/SRM 私有配置，不触发业务数据库写入。
