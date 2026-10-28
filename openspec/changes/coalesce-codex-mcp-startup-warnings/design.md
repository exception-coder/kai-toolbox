# 设计

应用 DENS-01：重复状态不挤占会话；FEED-01：提示真实工具不可用与恢复方式；EVID-01：区分一次 HTTP 探测与实际 Codex 运行恢复。无例外，不新增菜单、弹框或配置。

每个 runCodexAppServerTurn 创建独立 CodexMcpStartupWarnings，沿用原线程/轮次过滤。支持顶层及嵌套 status/error，分类 challenge、forbidden、timeout、unavailable。同一服务同类失败在 ready/completed/connected 之前只发一次；starting 不清除记录，不跨轮保存或泄漏全局状态。不同服务及不同失败类别独立保留。

不把外部 JSON、传输栈、请求 ID 或潜在凭据送入聊天提示。结构化 stderr 记录 session/thread/server/reason，原始客户端日志仍是网络排障依据。文档工具提示可直接查官方文档，不声称已经自动切换或恢复；必需 MCP 校验失败仍按原规则终止依赖任务。

属于通知适配的内部 Bug 修复，不改变 AI 编程架构、公共协议、资源权限或工具职责，无整体架构文档改动。
