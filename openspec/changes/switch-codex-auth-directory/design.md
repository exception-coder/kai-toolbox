## Context

Codex 原生 thread 存储在其 `CODEX_HOME` 中。现有 `duplicateSession` 已能复制工作目录、分组和运行配置，并为目标 Auth 创建空白 thread；缺少的是当前会话中的目录发现和切换入口。

## Decisions

1. 不修改既有会话的 `codexHome`。切换通过现有复制会话协议完成，避免 thread、模型目录、插件和 MCP 能力跨账号混用。
2. 目录发现仅扫描运行用户主目录的直属文件夹，并只返回名称以 `.codex` 开头的目录；不提供任意文件系统浏览。
3. 选择目录后增加确认步骤，明确源会话保留、目标会话沿用工作目录与运行配置。切换动作保持在当前会话的配置层级，不新增账号管理导航。
4. 授权目录查询失败时禁用入口；不影响当前会话继续工作。

## Risks / Trade-offs

- 新会话不继承原生 thread 历史；界面在确认前明确其为新会话，源会话仍可返回。
- 只发现主目录直属 `.codex*` 目录；自定义路径仍可在新建会话时手工填写。

## Architecture Impact

这是既有按会话 `codexHome` 和复制协议的 UI/API 补全，不改变 AI 编程架构的上下文分层、证据流、任务策略或生命周期，因此无需更新 `docs/ai-coding-architecture.md`。
