## Why

长时间编码会话经常在完成一个阶段后以正常回合终态停下，但目标工作仍未完成，用户只能反复查看并手工发送“继续完成下一阶段”。现有持久消息队列只能发送用户预先写好的消息，不能判断目标是否完成、是否应继续，且浏览器关闭后不应承担调度职责。

本变更引入会话级、显式启用且有界的自动推进能力：由服务端监督会话，在每轮彻底收口后根据结构化结果和可验证完成证据决定继续、完成或暂停，直到达到目标终态。

## What Changes

- 新增会话级“自动推进”运行配置和持久状态；默认关闭，只能由用户显式启用，并允许随时暂停、恢复或终止。
- 为每个运行持久绑定 Execution Context：会话、项目根目录、仓库与分支快照、OpenSpec change、当前 task、执行阶段、Agent session 和运行代次；Forge 派发 task 时写入 current task，不从聊天文本猜测。
- 增加两层连续执行保险：Forge 管理的 Agent Skill 约束 Agent 在存在明确下一步时不得结束；Forge Runtime 在每个权威回合终态后重新读取 OpenSpec 状态，即使 Agent 提前停下也会继续同一 task 或派发下一 task。
- 新增服务端监督器，复用现有会话运行状态、Sidecar 终态和持久队列，在浏览器断开或服务重启后仍能安全恢复。
- 新增结构化轮次处置协议，将 `CONTINUE`、`COMPLETE`、`WAITING_USER`、`BLOCKED` 和 `FAILED` 与引擎的普通 `end_turn` 分离。
- 对 OpenSpec 项目增加确定性完成门禁：活动 change、任务清单、严格校验与项目验证证据未闭环时不得仅凭自然语言宣布完成。
- 将 OpenSpec change 定义为严格运行的完成边界，并按 `APPLY → VERIFY → QUALITY_GATE → STRICT_VALIDATE → ARCHIVE → DONE` 推进；阶段结束或引擎 `end_turn` 不是运行完成。
- 增加最大自动轮数、最长运行时间、无进展检测和重复动作检测；任何预算或安全阈值命中后暂停并请求用户处理。
- 增加紧凑的会话控制和状态反馈，展示目标、当前阶段、自动轮数、暂停原因与下一恢复动作。
- 在当前会话展示已绑定的项目、分支、OpenSpec change、delta specs、当前 task、任务进度和完成门禁阶段，绑定漂移或读取失败时展示可恢复状态。
- 新增“自动监督会话看板”，集中展示当前正在监督、等待处理和已暂停的会话，并提供搜索、筛选、进入会话及适用的暂停、恢复、终止操作。
- 保持现有权限策略：自动推进不自动回答提问、不替用户批准权限，也不提升当前会话的工具权限。

## Capabilities

### New Capabilities

- `session-autopilot`: 会话自动推进的启停、结构化完成判定、有界续跑、故障恢复、可观测状态和用户接管行为。

### Modified Capabilities

无。当前 `openspec/specs/` 尚无已接受规格，本变更不会把其它活动 change 的拟议行为当作现有基线。

## Impact

- 前端：`frontend/src/features/claude-chat` 的会话工具菜单、状态条、自动监督一级工作视图、API 类型与状态查询。
- 后端：`tools/tool-claude-chat` 的会话 API、自动推进应用服务、持久化与 `ClaudeChatService` 终态回调。
- Sidecar：`sidecar/claude-agent` 的结构化轮次处置上报、多引擎适配和 Forge 管理的连续执行 Skill 激活/能力确认。
- 数据：需要在 claude-chat 自有 SQLite schema 中保存每个会话的自动推进配置、Execution Context、运行代次、计数和最后处置；仍由应用启动时的幂等 schema 初始化执行，不引入人工迁移流程。
- 接口：新增会话自动推进的查询、启用、暂停、恢复、终止和跨会话看板查询 HTTP 契约，并通过既有 WebSocket 广播状态变化与看板失效提示。
- 依赖：不引入消息队列、Redis 或外部调度平台；复用 Spring、SQLite、现有 Sidecar 连接和持久消息队列。
- 回滚：关闭所有自动推进运行后可先撤除调度入口；保留新增表不会影响既有会话读写。

## Evidence Sources

- 当前实现：`ClaudeChatService#completeTurn` 只在成功终态释放一条持久队列消息，`SessionRuntimeStateService` 已提供 Java、SQLite 与 Sidecar 的一致性门禁。
- 当前实现：`Session#runTurn` 在 `TurnLifecycle.finish` 后才发布 `result`，可作为“本轮已彻底收口”的唯一触发点。
- 当前实现：前端 `useClaudeChatSocket` 已区分运行中、待确认、后台任务和失败终态，但调度生命周期仍依赖浏览器组件。
- 外部基线：Claude Managed Agents 将 `idle` 与 `terminated` 分离，并用 stop reason 区分 `end_turn`、`requires_action` 和预算暂停；OpenSpec 将 proposal、spec、design、tasks 与实现/验证作为同一活动 change 的可迭代证据链。

## Non-Goals

- 不让模型无限自我对话，也不把普通 `end_turn` 直接解释为任务完成。
- 不建立与 OpenSpec `tasks.md` 并行的 Forge task 清单或 `tasks.yaml`；Forge 只保存当前派发身份和审计快照，任务完成事实仍来自绑定 change。
- 不自动回答 `AskUserQuestion`、权限确认、凭据输入或其它需要人的决策。
- 不跨多个会话拆分或调度同一目标，不增加通用任务调度平台、MQ、Redis 或多租户能力。
- 不在本变更中实现生产发布、自动合并、自动提交或自动提高预算。
- 不保证任意自然语言目标都能被纯确定性证明；非 OpenSpec 会话允许使用结构化模型处置，但完成证据等级必须对用户可见。

## Unresolved Decisions

无阻断性业务决策。初始实现按单会话、默认最多 8 个自动回合和 4 小时运行上限设计；阈值作为用户可收紧的保护参数，不允许在运行中静默放宽。严格模式启用页明确展示“全部门禁通过后自动归档”，用户启用该模式即完成一次性授权；用户关闭此项时运行只到 `ARCHIVE_APPROVAL_REQUIRED`，不会伪装成完成。
