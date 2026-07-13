# 编码违规记录

> 本文件由 `coding-violation-log` Skill 自动维护。
> AI 编码前必须读取本文件，避免重犯已记录的错误。

| # | 类型 | 违规描述 | 正确做法 | 涉及文件 | 首次发生 | 次数 |
|---|------|---------|---------|---------|---------|------|
| 1 | 架构约束 | 将统一 LLM 网关配置拆成 AI 对话、LLM 网关、Java 八股等多个独立配置块 | 只保留中心化 LLM 网关配置；业务模块只选择自己使用的模型或网关档位，不单独维护 baseURL/API Key 配置块 | AiChatProperties.java、Java8guEnrichProperties.java、LlmGatewayProperties.java | 2026-07-10 | 1 |
