## Context

Codex 原生 thread 存储在其 `CODEX_HOME` 中。现有 `duplicateSession` 已能复制工作目录、分组和运行配置，并为目标 Auth 创建新 thread；缺少的是当前会话中的目录发现、切换入口和显式上下文交接。

## Decisions

1. 不修改既有会话的 `codexHome`。切换通过现有复制会话协议完成，避免 thread、模型目录、插件和 MCP 能力跨账号混用。
2. 目录发现仅扫描运行用户主目录的直属文件夹，并只返回名称以 `.codex` 开头的目录；不提供任意文件系统浏览。
3. 选择目录后增加确认步骤，明确源会话保留、目标会话沿用工作目录与运行配置。Forge 生成 `forge.codex-auth-handoff/v1` 结构包，并以新 thread 的显式首轮消息发送；不声称迁移模型隐藏状态、工具结果或旧 thread 身份。
4. 授权目录查询失败时，使用历史会话中已经绑定过的 Auth 目录作为降级清单；没有任何已知目录时才禁用入口，且不影响当前会话继续工作。
5. 交接采用“规格优先、证据分层、可降级”协议：先恢复仓库指令和 OpenSpec change/spec，再读取架构索引、领域快照/Graphify、源码、Git 与验证证据。浏览器只能证明当前已加载的可见会话，因此规格引用统一标记为 `PARTIAL_UNVERIFIED` 或 `UNKNOWN`，由目标 Auth 在同一工作目录重新核验 `missing / partial / stale / conflict`。
6. 官方 App Server 的同存储 `thread/fork` 可复制历史，`thread/inject_items` 可向已加载 thread 注入模型可见项；跨 Auth 的存储和能力边界不同，本实现不伪造原生 fork，而使用可审计显式交接包。后续若改为后台注入，交接 schema 和核验语义保持不变。
7. `lineage_id + auth_key` 是跨 Auth 切换的持久幂等键。同一链路首次进入目标 Auth 才创建会话与交接；后续往返直接恢复已关联会话。唯一约束收敛重复点击和并发请求，浏览器状态不作为事实源。

## Risks / Trade-offs

- 新会话不继承原生 thread 的隐藏状态；结构化摘要仍只覆盖当前页面已加载的用户/助手对话，规格与工作区事实必须在目标会话重新读取，源会话仍可返回。
- 只发现主目录直属 `.codex*` 目录；自定义路径仍可在新建会话时手工填写。
- 变更前已存在但从未建立链路的历史会话无法安全猜测彼此关系；首次从旧会话切换时建立新链路，此后保持幂等。

## Architecture Impact

本变更把跨 Auth 交接正式纳入上下文分层与证据流，因此同步更新 `docs/ai-coding-architecture.md`；不改变 OpenSpec、Graphify、源码和运行证据各自的权威边界。
