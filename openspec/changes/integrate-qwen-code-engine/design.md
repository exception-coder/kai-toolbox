## Context

Forge 的多引擎边界由 `sidecar/claude-agent/src/engine/engineContract.ts` 与 `builtinEngineAdapters.ts` 定义，Claude、Codex、Antigravity 和 OpenCode 的原生协议均在各自适配器内收敛为统一事件。会话编排位于 `sessionManager.ts`，Java 端持久化引擎字符串，前端通过 Sidecar 引擎目录展示可选项。当前 npm 依赖固定 `@openai/codex-sdk`，但没有 Qwen Code SDK。

QwenWork 桌面端没有被此仓库验证过的外部任务控制协议；官方 Qwen Code TypeScript SDK 则与当前 Node Sidecar 兼容。产品原则适用 `CTX-01`、`FEED-01`、`IDEM-01`：引擎身份必须明确、执行反馈必须可恢复、恢复已有会话不得重复创建原生会话。

## Goals / Non-Goals

**Goals:**

- 将 Qwen Code 作为独立、可识别的稳定引擎接入统一引擎目录。
- 保留 Qwen 原生 session 身份以续接会话，并支持中断与流式反馈。
- 隔离 SDK 原生类型、错误和事件，保持 Java/WebSocket/前端契约稳定。
- 将 Qwen SDK 纳入既有 Sidecar SDK 版本发现与升级入口，并更新 Codex SDK 固定版本。
- 对依赖、认证和轮次失败返回可操作错误，不静默切换其他引擎。

**Non-Goals:**

- 不控制或自动化 QwenWork 桌面端任务。
- 不通过 DashScope Chat Completions 自建另一套 Agent 循环。
- 不在本次扩展一次性后台任务能力、Qwen 专属 MCP 配置页或数据库结构。

## Decisions

### 1. 使用官方 TypeScript SDK，而非 Python 桥接

Sidecar 直接依赖 `@qwen-code/sdk`，由新的 `qwenEngine.ts` 持有 Qwen 原生查询、消息转换与异常处理。这样无需额外 Python 环境或进程协议，且供应商类型不会进入 `engineContract.ts`。备选的 Python `qwen-code-sdk` 需要跨进程桥接，与现有 Node 生命周期和打包方式不匹配。

### 2. Qwen 是独立引擎身份

在 builtin engine registry 中新增 `qwen`，Java 与前端只扩充同一身份集合。不会把 Qwen 模型挂在 Codex、Claude 或 OpenCode 名下，避免权限、恢复和故障语义混淆。会话持久层已有字符串字段，无需迁移。

### 3. 适配器负责原生会话和统一事件

Qwen 适配器从 SDK 消息中提取 session ID，并通过既有 `setSdkSessionId` 持久化；后续轮次使用该 ID 恢复。助手文本、工具开始/完成、结果和错误转换为既有 Sidecar 事件。未知消息仅作为内部诊断处理，原生消息不得发送给 Java 或浏览器。

### 4. 权限以 Forge 策略为上限

适配器将 Forge 会话权限映射到 Qwen SDK 的权限模式；当 SDK 请求逐项工具授权时复用现有 `canUseTool` 回调。只读或禁用工具场景不得因 Qwen 原生默认值扩大权限。不能可靠映射的模式采用更保守的确认策略。

### 5. SDK 版本进入统一维护入口

`SidecarVersionService` 增加 Qwen 的 npm 包定义，现有升级流程继续负责依赖更新与构建验证。Codex 仍映射 `@openai/codex-sdk`，仅更新固定版本，不改变其 App Server 优先、SDK 回退的运行策略。

### 6. UI 复用既有引擎目录

Qwen 通过现有引擎选择器、图标与状态文案出现，不增加独立页面或卡片。依赖不可用时由目录状态给出原因和恢复动作，避免不可解释的灰色选项。

引擎切换菜单沿用当前会话身份（`CTX-01`、`IDEM-01`），打开时重新查询 Sidecar 目录；目录尚未返回或失败时，Antigravity 仍显示为带“检测中/重新检测”的状态行，不能直接切换，直到 Sidecar 明确报告可选。此局部反馈落实 `FEED-01`、`DENS-01`：用户能看见检测状态和恢复入口，刷新不改变会话、草稿或菜单位置。菜单仍是附着在当前会话的覆盖层，不增加导航；点击遮罩关闭，窄屏保持原有入口和行为。重复打开或重复检测只查询目录，不创建会话；前端 typecheck、构建及现有目录选择器回归已通过，菜单状态分支仍待实际浏览器验证。

## Risks / Trade-offs

- [Qwen SDK 仍在快速演进] → 固定精确版本、使用隔离适配器，并以合成消息测试锁定当前事件契约。
- [本机尚未登录或凭据失效] → 保留供应商错误的可读摘要，返回登录/配置恢复提示，不回退其他引擎。
- [恢复参数或消息类型随 SDK 变化] → 只依赖公开 TypeScript 类型；SDK 升级必须重新运行适配器测试和完整 Sidecar 编译。
- [Qwen 与 Forge 权限模型不完全同构] → 采用权限下界映射，未知值默认要求确认。
- [当前运行产物正在使用] → 先完成源码构建与静态验证；只有获得用户单次明确授权后才重启并执行运行验收。

## Migration Plan

1. 安装并固定 Qwen 与 Codex SDK 版本，确认 Node/TypeScript 兼容性。
2. 增加适配器、注册表和跨层身份识别，补齐专项测试。
3. 同步架构与多引擎当前设计，执行 Sidecar、前端、后端及 OpenSpec 门禁。
4. 提交源码但不主动重启；获授权后通过 `node forge.mjs` 重启并完成运行验收。

回滚时恢复 npm 依赖锁与 Qwen 注册项即可；既有会话的 `engine=qwen` 会由旧版本规范化为默认引擎，因此正式部署回滚前应先阻止创建新的 Qwen 会话。无数据库 DDL 回滚。

## Open Questions

- Qwen SDK 后续若提供稳定的模型目录接口，再单独接入动态模型刷新；本次允许使用默认模型或手工模型标识。
