## Context

当前 `SystemResourceService` 已用 `ResourceProvider` 聚合 Ops 数据源及两个固定应用账号，并通过 Forge 的 `discover_resources/execute_resource` 执行；但应用配置仍在 `tool-claude-chat` 中硬编码为 ERP/SRM 单例，Sidecar 普通会话还同时注入五个固定 MCP。资源页能关联资源，却不能在同一处创建任意系统的多个 APP 账号。

## Goals / Non-Goals

**Goals:**

- `tool-ops` 成为通用 DB/APP 源配置和系统绑定的所有者。
- APP 支持多实例、服务端保存账号密码、无认证/表单 Cookie/JSON Bearer 三类常见测试登录。
- Forge 保持两个稳定工具，资源增删无需改变工具目录。
- 普通开发会话不再承担固定业务系统 MCP 的上下文成本。

**Non-Goals:**

- 不提供生产环境 APP 调用或数据库写入。
- 不建设独立密钥保险库，不把当前本地单用户明文 SQLite 描述成加密存储。
- 不删除旧 ERP/SRM 配置及 HTTP API，不改变受限业务咨询的专用只读装配。

## Decisions

### 通用应用资源归属 tool-ops

新增 `ops_application_resource`，保存资源元数据、登录协议和凭据；API 永不返回密码，只返回 `credentialConfigured`。`ApplicationResourceProvider` 与数据源 Provider 同属资源模块，通过现有 SPI 被目录发现。相比继续给每个业务系统增加 ConfigService，这使新增系统成为配置动作。

### 稳定 Tool + 动态资源目录

Forge 继续只暴露 `discover_resources` 和 `execute_resource`。系统、环境和资源通过绑定 ID 动态解析；不为每个连接生成 MCP Tool。普通开发会话只装配 Forge MCP，旧固定桥接分支留作兼容，但不再默认注入。此设计与 MCP `tools/list` 的稳定契约一致，也避免工具数量随资源增长。

### 服务端强制安全边界

资源执行先经 `SystemResourceService` 校验绑定、启用、环境和能力；APP Provider 再校验同源、HTTP(S)、方法、响应上限和认证协议。只有 LOCAL/DEV/TEST/UAT 可执行。页面和模型仅看到脱敏账号与配置状态。

### 单一系统上下文界面

资源页保持 AI 交付中心入口，按“系统关联 / 数据库连接 / 应用账号”渐进展示。应用账号采用紧凑列表与编辑表单，不新增侧栏、仪表盘卡片或独立弹窗。适用产品原则：P1 保持系统对象上下文、P3 渐进披露、P5 操作反馈可恢复；无例外。

## Risks / Trade-offs

- [本地 SQLite 中凭据仍为明文] → 延续当前单用户边界，API 脱敏且禁止日志输出；未来可替换凭据存储端口。
- [通用登录协议无法覆盖所有系统] → 只支持 NONE、FORM_COOKIE、JSON_BEARER；特殊系统继续通过新 Provider 扩展。
- [旧会话依赖固定 MCP 名称] → 保留桥接实现和旧 API，仅停止新普通会话默认装配；咨询专用装配暂不改。
- [APP CALL 可能修改测试数据] → Tool 继续标记非只读/可能破坏，执行仅允许非生产环境并保持审批语义。

## Migration Plan

1. 幂等创建通用应用资源表并开放 CRUD/Provider。
2. 页面允许创建多个 APP，数据库继续复用 Ops 多数据源。
3. 新普通会话只装配 Forge；旧固定接口继续工作。
4. 后续由管理员按系统逐项登记/绑定，不自动复制旧密码。

回滚时恢复 Sidecar 默认固定 MCP 清单并隐藏通用 APP 编辑入口；新增表和记录保留，不影响旧配置。

## Open Questions

无阻塞问题。生产资源保持“可登记但不可执行”，专用认证协议按后续真实系统需求扩展。
