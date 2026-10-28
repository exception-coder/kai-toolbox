# 合并 Codex MCP 初始化失败提示

## 问题与证据

用户截图中 openaiDeveloperDocs 初始化返回 HTTP 403，响应 code=challenge；请求标识不同的失败通知重复占满会话。现有处理只提取 message/reason，缺失时序列化整个通知，未读取 error 字段，也未对重复通知合并。

本机 config.toml 的服务 URL 与 [OpenAI 官方配置](https://developers.openai.com/learn/docs-mcp)一致。2026-10-28 通过 PowerShell 向该公开地址发送一次 initialize，HTTP 200 且含 protocolVersion；说明该次探测可达，不能证明截图时段或 Codex 客户端链路始终可达，也不能确认远端触发挑战的具体策略。

## 变更

在 App Server 通知适配层解析失败、分类并输出简短恢复提示；同一轮同一工具同类失败合并，确认恢复后允许再次通知。保留结构化诊断事件，不打印原始外部错误载荷。权限、必需工具校验与原生网络策略保持原有契约；不绕过远端挑战、不禁用全局工具、不自动重启服务。
