## Why

用户要求将系统与中间件迁入 AI 交付中心，统一系统资源、测试账号关系及 Tool/MCP 发现。现有 ops 数据源与 ERP/SRM 应用配置分离，固定 MCP 接线和复制连接配置容易漂移。

## What Changes

- 增加系统资源关系目录，引用项目库系统身份和现有资源，不复制凭据。
- 通过 provider SPI 扩展数据源和应用账号来源，提供统一发现、查询、测试与应用调用。
- AI 交付中心增加系统资源与测试账号页面，旧 ops 链接跳转，保留原始资源编辑和历史。
- 内置工具与 MCP 使用相同后端路由，返回脱敏元信息和真实能力范围。

## Capabilities

### New Capabilities

- `system-resource-discovery`: 系统资源绑定、能力发现与执行。

### Modified Capabilities

## Impact

toolbox-common 仅增加无实现的 provider/identity 契约；tool-ops 拥有关系与执行编排；项目库和应用模块各自实现 provider。新增 ops_resource_binding，由应用幂等初始化，无人工迁移。旧资源 ID、查询历史及凭据位置保留。未识别归属不自动绑定。
