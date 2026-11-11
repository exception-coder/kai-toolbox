---
id: kai-toolbox-claude-chat-session-lifecycle
project: kai-toolbox
module: claude-chat
title: Vibe Coding 会话与轮次状态
type: state
stability: draft
tags: [会话状态, 轮次状态, 收口, 中断, 续跑, 队列, sidecar中断]
related: [kai-toolbox-claude-chat-session-concept]
summary: Vibe Coding 把状态分成连接、Agent 执行、轮次结果、待发送队列四层；执行层描述当前进度，发送仍由后端准入与队列门禁决定，轮次出结果不等于 Agent 已空闲。
---

> 口径来源：2026-11-11 对照 Codex App Server 0.162.1 协议类型、Claude Agent SDK 0.3.286 类型定义、Agent Client Protocol 文档与本仓代码整理。本文保留目标状态与后续动作，P0 的源码及验收边界见文末；尚未接入的上游信号不作为当前运行能力。

## 为什么要分层

用户看到的“已连接”“此轮已完成”“正在运行”来自不同层，混在一起就会出现“此轮已完成”与“Codex 正在运行”同时显示的矛盾。各层只回答自己的问题：

| 层 | 回答的问题 | 由谁决定 |
| --- | --- | --- |
| 连接 | 浏览器、后端、Sidecar、引擎之间通不通 | WebSocket 与 Sidecar 连接 |
| Agent 执行 | Agent 现在在做什么、该谁行动 | 后端综合状态（`SessionRuntimeStateService` 的 effectiveStatus + consistency）与当前轮次事件 |
| 轮次结果 | 刚结束的那一轮结果如何 | 该轮 `result` 的结束原因 |
| 待发送队列 | 排队的消息到哪一步了 | 队列投递记录 |

规则：**界面主状态只取 Agent 执行层**；连接层只在异常时出现；轮次结果只描述历史，不代表“现在空闲”。

## 上游官方状态（对照用）

| 来源 | 层级 | 状态 |
| --- | --- | --- |
| Codex App Server | 会话 thread | `notLoaded` 未加载、`idle` 空闲、`systemError` 系统错误、`active`；active 附带 `waitingOnApproval` 等审批、`waitingOnUserInput` 等回答 |
| Codex App Server | 轮次 turn | `inProgress`、`completed`、`interrupted`、`failed`；失败带 `codexErrorInfo`（上下文超限、会话预算/用量/限流、服务过载、鉴权、请求错误、网络断流、沙箱、策略拒绝等）；`error` 通知带 `willRetry` |
| Codex App Server | 工具条目 | 命令、补丁 `inProgress / completed / failed / declined`；MCP 调用 `inProgress / completed / failed` |
| Claude Agent SDK | 会话 | `session_state_changed`：`idle`、`running`、`requires_action`；当前官方文档允许 `idle` 与 `result` 乱序，是否等待后台任务受配置影响，需结合实际 SDK / CLI 版本核验 |
| Claude Agent SDK | 轮次结果 | `success`、`error_during_execution`、`error_max_turns`、`error_max_budget_usd`、`error_max_structured_output_retries`；另有 `terminal_reason`（如 `prompt_too_long`、`api_error`、`aborted_tools`、`max_turns`、`budget_exhausted`） |
| Claude Agent SDK | 后台任务 | `running`、`completed`、`failed`、`stopped`、`killed` |
| Agent Client Protocol | 轮次停止原因 | `end_turn`、`max_tokens`、`max_turn_requests`、`refusal`、`cancelled` |

共同结论：**轮次结果、会话输入就绪和原任务完成是不同事实**。同一轮的结果、后台任务与清理证据未齐全时，不能仅凭一个 `result` 或 `idle` 放行队列。

版本差异：本仓锁定的 Claude SDK 0.3.286 类型注释描述 `idle` 在延迟结果及后台子 Agent 收口后发出；2026-11-11 查阅的[官方 TypeScript 参考](https://code.claude.com/docs/en/agent-sdk/typescript#sdksessionstatechangedmessage)则允许两者乱序。接收状态事件需显式开启 `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1`，后台任务是否计入还受 `CLAUDE_CODE_BG_TASKS_REPORT_RUNNING` 影响。本次 P0 不修改 SDK 配置或依赖，不把任一版本注释直接当作已实测的跨版本保证。

## Agent 执行状态与后续动作

以下是目标口径，需按实际信号逐步接入。主状态是展示投影，不替代 `canSend`、项目访问、执行计划、工作准入和持久队列校验；前端不能因文字变为“已就绪”绕过后端。

| 状态 | 判定依据 | 界面显示 | 用户可做 | 系统后续动作 |
| --- | --- | --- | --- | --- |
| 空闲·可发送 | effectiveStatus=IDLE、consistency=CONSISTENT 且 canSend=true；实际派发仍通过其他后端门禁 | 已就绪（附最近一轮结果） | 发送；派发排队消息 | 有排队消息且允许自动派发时，派发下一条 |
| 运行中 | 有活动轮次（Codex turn `inProgress` / Claude `running`） | {引擎} 正在运行 · 当前阶段 | 插话、排队、中断 | 持续接收进度与心跳，心跳超时转“状态待校正” |
| 等待审批 | Codex `waitingOnApproval`；Claude 权限请求 | 等待你审批：{工具/命令} | 允许、拒绝、改为自动批准 | 暂停计时；队列不放行；推送提醒 |
| 等待回答 | Codex `waitingOnUserInput`；Claude 提问请求 | 等待你回答 | 回答问题 | 同上 |
| 收口中 | 已出结果，但子 Agent、延迟结果或最终回复未确认 | 正在收口本轮结果… | 等待；可中断 | 复查子 Agent 与最终回复；确认后转空闲，超限转“未完整完成” |
| 后台任务进行中 | 主轮次已结束，后台任务数 > 0 | 后台任务进行中 · N | 按引擎已实现能力查看或停止；当前后台任务未结束时不自动放行队列 | 任务结束后重新核对，满足既有发送及队列门禁才允许后续派发 |
| 自动重试中 | 上游 `error` 且 `willRetry=true` | 连接中断，自动重试 {n}/{max} | 等待；可中断 | 重试成功回到运行中；重试耗尽转“失败” |
| 中断中 | 已请求中断，尚未确认 | 正在终止… | 再次点击重试终止 | 有界复查；确认同轮停止并清理后转“已中断”，超时保留待确认与队列 |
| 已中断·可续跑 | 已核实用户中断且无同轮活动；Sidecar 丢失或断连本身不证明已中断 | 本轮已中断 | 核对后续跑、重新发送或放弃 | 保留历史与进度；不自动续跑 |
| 失败 | 轮次 `failed` 或 SDK 错误结果 | 按失败类型显示（见下表） | 按失败类型处理 | 不自动放行队列；记录原因 |
| 状态待校正 | consistency≠CONSISTENT（幽灵运行、轮次不一致、持久化漂移等） | 状态待校正 · 原因 | 重新核对；必要时重载会话 | 核对快照新鲜度、轮次归属及后端状态后按现有规则校正；迟到或缺失证据不覆盖新轮次 |
| 重连中 | 浏览器或 Java↔Sidecar 断开 | 正在重连会话… | 等待 | 后台重连并按真实快照恢复；恢复前不得显示空闲 |
| 引擎不可用 | 引擎未通过运行时检测 | {引擎} 当前不可用 | 换引擎、查看检测结果 | 跳过自动恢复，提示原因 |
| 未知 | 无法取得 Sidecar 快照 | 会话状态待确认 | 等待；重新核对 | 继续查询，不判定为空闲 |

### 失败类型与后续动作

| 失败类型 | 上游依据 | 用户下一步 | 系统下一步 |
| --- | --- | --- | --- |
| 额度或限流 | `usageLimitExceeded`、`rateLimitExceeded`、`sessionBudgetExceeded`、`error_max_budget_usd` | 等待后重试、换账号或模型、调整预算 | 显示可重试时间；不自动重发 |
| 上下文超限 | `contextWindowExceeded`、`prompt_too_long` | 压缩上下文或新开会话续写 | 提供压缩或带摘要新建入口 |
| 鉴权失效 | `unauthorized` | 重新登录或更新服务商配置 | 打开对应配置入口 |
| 服务端或网络 | `serverOverloaded`、`internalServerError`、连接失败或断流、`api_error` | 重试 | 已自动重试过的不再循环重试 |
| 请求或工具错误 | `badRequest`、`sandboxError`、`error_during_execution`、`malformed_tool_use_exhausted` | 查看详情后调整需求重发 | 保留错误详情 |
| 内容被拒绝 | `cyberPolicy`、`misalignmentPolicyViolation`、`refusal` | 改写需求 | 不重试 |
| 达到轮数或次数上限 | `error_max_turns`、`max_turn_requests`、`tooManyDenials` | 继续本轮、调整上限或权限 | 支持一键“继续” |
| 未完整完成 | 我们的收口检查判定最终回复缺失或子 Agent 未收口（`incomplete`） | 让 Agent 继续或确认已完成 | 队列暂停，等待确认 |

## 轮次结果

结果卡片只描述“那一轮”，不代表当前空闲。

| 结果 | 结束原因 | 卡片文字 |
| --- | --- | --- |
| 完成 | `end_turn`、`success`、`completed`、`stop` | 此轮已完成 |
| 未完整完成 | `incomplete`、`queue_check_unconfirmed` | 此轮未确认完成 |
| 已中断 | `interrupted`、`cancelled`、`user_cancelled` | 此轮已中断 |
| 失败 | 其他错误原因 | 此轮失败 · {失败类型} |
| 未入队 | `admission_rejected` | 未开始：会话忙 |

## 待发送队列

| 状态 | 含义 | 后续动作 |
| --- | --- | --- |
| 排队中 | 等待当前轮次结束 | Agent 回到“空闲·可发送”且上一轮安全结束后派发 |
| 派发中 | 已发给 Sidecar，未确认接收 | 等待接收确认 |
| 已接收 | Sidecar 已接收，轮次开始 | 跟随 Agent 执行状态 |
| 已暂停 | 用户暂停 | 用户恢复后再派发 |
| 待确认 | 上一轮结果不足以安全放行 | 用户确认后继续 |
| 失败 | 派发或执行失败 | 用户重试或删除 |

## 边界

- “已连接”只表示通道连通，不表示 Agent 空闲；正常状态下不单独显示。
- 只有“空闲·可发送”允许把最近一轮结果显示为当前状态。
- 队列完成核对属于系统动作，界面应显示“正在核对上一轮是否完成”，不能只显示“正在运行”。
- “被中断”不是报废：历史与进度保留，可以续跑。
- 门控开发流程里的人工确认关卡属于前门模块编排，不属于本状态机。

## 当前落地范围与后续

P0 沿用原会话和队列，不增加状态库：

- 核对次数仍保存在现有队列 runtime 中。`queueCheck` 仅在 Sidecar 确认接收当前核对轮后广播，携带 `turnId`；`ready.queueCheck` 恢复当前已接收的核对进度。准备派发或发送异常不冒充已经执行。
- 前端收到核对接收事件时打开新的运行轮次，结束后关闭。已结束核对轮的重复事件、旧结果不关闭当前新轮；服务端继续过滤不属于当前轮次的 Sidecar 事件。
- 结束、核对开始、审批/回答变化、中断回执与后台任务快照推进状态查询代次。旧请求取消且只能写入旧查询键；不以 HTTP 返回时间证明快照属于新轮次。
- 顶栏、专注阅读与底部状态栏共用执行状态投影。等待操作、终止中、收口及一致性异常不会被本地“运行中”盖住；只有全链路确认为可发送的 IDLE 时才把历史结果展示为当前空闲状态。连接正常提示在手机和桌面均收起。
- 当前代码仍不改变原生轮次完成、后台任务、暂停/删除和队列安全放行条件。模型配置及 Codex 的模型、强度、速度通道不在本次改动范围。

P1 尚待按锁定版本接入 Codex 会话状态与 Claude 原生状态、重试等信号，覆盖结果与空闲乱序及配置差异；已有重连/重试处理继续复用。失败分类、对应恢复按钮及会话列表的全量投影属于后续，按钮只展示实际支持的能力，不能自动重放结果不明的操作。

源码检查与运行验收分别记录在[可靠队列任务](../../../openspec/changes/reliable-vibe-message-queue/tasks.md)；未加载新版本及未执行真实浏览器/模型验证时，不宣称线上生效。
