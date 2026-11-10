## Context

已核对 OpsDatasourceService、OpsQueryService、ErpAppConfigService、SrmAppConfigService、toolboxMcpBridge 和 ProjectRegistryService。ops 数据源存在环境及账号字段；应用账号来源是已有设置服务，非 Forge 用户账号。

## Goals / Non-Goals

一处维护系统资源关系、引用原有凭据，并让 Tool/MCP 动态发现可用资源。支持现有 SQL、Redis 连通测试和 ERP/SRM 应用适配器；MQ 仅登记不虚构能力。不新增插件进程、消息总线或第二套凭据库；不自动执行实际系统查询或修改业务数据。

## Decisions

### 可插拔契约

ResourceProvider 描述脱敏资源和支持的动作，接收资源 ID 与类型化请求；ProjectSystemDirectory 提供系统身份。契约放平台公共端口，所有实现归所属工具，不新增工具间 Maven 依赖。Spring 集合注入注册 provider，重复 ID 启动失败；缺失 provider 显示不可用并拒绝执行。

### 关系与执行

关系表只持有 systemId、providerId、resourceId、用途和启用状态；唯一约束防重复。服务端每次执行重新读取资源及环境，不能由客户端覆盖环境或凭据。只有 LOCAL/DEV/TEST/UAT 资源可执行；SQL 使用既有只读策略和上限，应用沿用原地址限制与登录机制。

目录输出账号名与凭据配置状态，不含密码、任意配置 JSON、连接参数或 Cookie。Claude SDK 内置 Tool 与 stdio MCP 复用相同协议适配和统一应用服务。MCP 提供 discover_resources、execute_resource，后者明确区分 TEST、QUERY、CALL；因为 CALL 可能修改测试数据，工具整体保守标注为非只读、可能破坏性，不按业务系统增加工具名。

受限咨询模式保持原工具范围，不注入新的资源执行工具；不能因扩展 Forge 工具集而绕过咨询模式的既有范围限制。

### 迁移与界面

UI 通过公开接口复用原资源编辑和 ERP/SRM 登录配置；将资源与项目库系统显式关联，不按名称匹配。旧 ops 作为资源维护实现保留，菜单入口迁到 AI 交付中心；旧链接保留参数跳转。修改源配置后重新发现即生效。现有应用适配器各引用一个配置账号，新增多账号来源通过 provider 扩展，不冒充已实现通用登录协议。

## Research

- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)：结构化结果、工具发现和调用；资源链接不保证出现在 resources/list。
- [Spring 集合注入](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html)：按接口装配实现集合。工程保持 Spring 6.2 / Boot 3.4，不引入新框架。

本项目采用模块内 adapter + 稳定端口，适合已有单进程应用；不为可插拔性额外部署插件平台。

## Risks / Trade-offs

DDL 上下文返回 PARTIAL，新表不在现有基线，DDL 未核验；按本变更新增表设计，旧表不改。凭据沿用现有服务端存储，不能声称本次提供了加密保险库。配置过期、provider 缺失、系统删除和非测试环境必须明确拒绝执行。手动资源控制台权限保留，AI 操作不复用可确认写入 SQL 的通道。

ERP/SRM 应用连接器的 TEST 标签来自既有“测试应用配置”的用途约定，并非自动识别目标环境。它们沿用原生产域拒绝与同源校验，无法识别所有未知生产地址；管理员必须只配置测试实例。本次不扩大或声称完善了原登录连接器的网络安全策略。

## Verification and rollback

验证 provider 装配、重复/未知 ID、环境改变、禁用绑定、SQL 只读、凭据不泄露、旧链接及权限；前端/Sidecar/宿主构建、Forge 门禁、实际目录发现与稳定观察。实际业务查询与登录不自动触发。新增关系可删除而不删除源资源；旧 API 继续可用。浏览器先前拒绝访问，不绕过，视觉验收保持未知。

## Connector maintenance

1. 在资源所属模块实现 `ResourceProvider`，使用稳定且唯一的 provider ID 和资源 ID；不要把显示名称当引用键。
2. `resources()` 仅返回 `ResourceDescriptor` 元信息，并根据真实实现与配置状态声明能力；配置入口由 `configurationUrl` 提供。不要返回密码、Cookie、原始配置或含凭据的 URL。
3. `execute()` 使用资源 ID 读取所属模块的当前配置，复用现有查询/登录服务。系统关联、启用和环境检查由共享服务执行；连接器仍负责自身目标地址限制、只读策略和协议语义。
4. 通过 Spring bean 注册即可自动进入目录。新增模块按仓库常规方式装入宿主；本次可插拔是构建/启动时装配，不支持在线上传任意插件或热卸载。
5. 添加缺失配置、敏感字段、拒绝路径和真实协议契约测试。删除连接器前先停用关联；已有引用保留并显示不可用，不连带删除资源。

此层使用 Java 21 和 TypeScript/Node HTTP，不增加平台 Shell 脚本或“中间语言”。Windows、Ubuntu、macOS 共用相同接口和产物；只有 Windows 已执行本轮验证，其他操作系统不得标为实测通过。

## Compatibility boundaries

旧 ops 分组仍作为连接编辑器的存量分组保留，不自动升级为项目库系统。旧 ERP/SRM/SCM 独立数据库配置 API 与 MCP 暂保留兼容；统一目录当前覆盖 ops 数据源及 ERP/SRM 应用账号，不声称覆盖所有历史私有配置。需要把独立数据库纳入统一目录时，先在中间件连接中登记并显式绑定，或增加引用原配置的 provider；不要自动拷贝历史密码。资源关联的修改在下一次发现/执行时生效，已开启的会话需重新发现资源。
