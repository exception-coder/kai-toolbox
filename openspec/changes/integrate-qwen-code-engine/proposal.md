## Why

Forge 目前不能通过官方 SDK 运行 Qwen Code Agent，用户只能选择既有引擎或把千问模型当作普通模型接入，无法获得 Qwen Code 的会话与工具执行能力。Qwen 已提供适用于当前 Node Sidecar 的官方 TypeScript SDK，因此应以独立引擎接入，同时保持 Codex 继续由官方 `@openai/codex-sdk` 驱动。

## What Changes

- 新增 Qwen Code 稳定引擎，通过官方 `@qwen-code/sdk` 创建、续接、中断并流式执行 Agent 轮次。
- 将 Qwen 原生消息转换为 Forge 统一事件，原生对象不越过 Sidecar 边界。
- 在引擎目录、会话创建、切换和 SDK 版本管理中识别 Qwen Code。
- 升级并固定当前官方 `@openai/codex-sdk` 版本，保留 Codex 独立引擎语义。
- 明确 QwenWork 桌面端不属于此集成范围；不声称能从 Forge 外部创建或管理 QwenWork 任务。

## Capabilities

### New Capabilities

- `qwen-code-engine`: Qwen Code SDK 引擎的选择、会话连续性、事件转换、中断、权限与故障恢复契约。

### Modified Capabilities

- 无。

## Impact

- Sidecar 引擎注册表、新增 Qwen SDK 适配器及 npm 依赖。
- Java 会话引擎校验、Sidecar SDK 版本发现与升级服务。
- Vibe Coding 与项目工作区中的引擎类型、图标、选择器和状态文案。
- AI 编程架构与当前多引擎设计说明。
- 不新增数据库表或人工执行 SQL；现有字符串引擎字段兼容新值。
