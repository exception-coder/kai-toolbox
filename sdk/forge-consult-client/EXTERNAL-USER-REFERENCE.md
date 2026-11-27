# 连续实施答疑：接口与恢复参考

SDK 0.6.0 / 后端合同 1.7.0。源码与自动测试交付不代表目标实例已升级；真实联调状态见 [任务](../../openspec/changes/consult-external-user-session/tasks.md)。

先看 [接入图解](EXTERNAL-USER-SESSIONS.md)，需要核对字段、恢复和统计口径时再查本文。

## 身份与消息流




- `clientId` 来自应用凭据，`tenantId` 必须匹配授权；`externalUserId` 是接入方稳定映射的业务用户 ID，允许 1–100 位字母、数字、`_ . : -`。不能使用昵称、群 ID 或每次变化的随机 ID。
- 同一个人在不同 IM 中的账号由接入方确认关联。同一用户会话包含多来源上下文时，接入方负责来源可见范围和回复路由；不要把不同可见权限的数据合并到同一 ID。
- `conversationId` 仍是调用方业务关联；来源群、平台、消息 ID、引用消息和发生时间可以放 `businessContext`。这些都是调用方资料，不授予额外权限。
- `requestId` 是应用内单次消息处理的幂等键；`problemId` 是业务问题关联，不是用户身份。回复的问题归并候选可以放 `businessResult`，不能仅凭消息数统计问题数。
- `result.session.id` 是 Forge 的稳定逻辑身份，服务端保存它与原生 thread 的对应关系；调用方不传 Codex thread ID。原生标题和返回标题均为 `<externalUserId>-实施答疑`，`source=CONSULT_SDK`。

## 调用与恢复

```ts
const input = {
  agentId: 'it-support-partner' as const,
  tenantId: 'company-a',
  externalUserId: 'employee-123',
  conversationId: 'feishu-group-456',
  problemId: 'issue-789',
  requestId: 'feishu-message-001', // 发送前保存；不确定时保持原 ID 和原内容
  title: '样衣扫码',
  description: '手机端怎么操作？',
  businessContext: {
    channel: 'feishu', chatId: 'group-456', messageId: 'message-001',
    replyToMessageId: 'message-000', occurredAt: '2026-11-27T10:00:00+08:00',
  },
};
const task = await client.submit(input);
// 使用已有 get(task.taskId) / find(input.requestId) 查询终态并保存 result。
// 仅 REPLY 的候选进入现有发送流程，UPDATE_ONLY/IGNORE 不生成外发消息。
```

也支持 `analyzeOnce(input)` 等待结果；传 externalUserId 后该调用改用同一持久任务流程。HTTP 超时、`REQUEST_STATUS_UNKNOWN` 或 `EXTERNAL_ANALYSIS_PENDING` 时先 `find(requestId)`，不得换 ID 重发。`EXTERNAL_SESSION_BUSY` 表示上一轮尚在执行；`EXTERNAL_SESSION_UNCERTAIN` 表示原生执行或线程身份仍需核对，不能自动重试。接入方按用户串行发送；原生明确确认中断后会释放占用，后续新消息仍使用原线程。重复原请求返回原任务，改内容复用 ID 返回冲突。

明确省略 `externalUserId` 保持既有无状态分析及临时线程清理。该参数只用于后端 FORGE_FLEX，不代替 WSS 用户登录。当前一个实例提供此映射，不能在多个独立 Forge 实例间随机负载均衡。

连续模式会持久保存任务输入/输出和 Codex 上下文，这是对“Forge 只分析不留存”的显式可选扩展。图片来源与现有 `imageRefs`/上传合同不变，原生历史也可能包含分析输入；不要把省略附件 BLOB 误认为完全无留存。

账号目录和模型在首次创建时固化；改变默认账号或授权系统范围会明确失败，不偷偷换线程。恢复失败、断线终态未知或持久化线程身份失败时保留执行占用，须由维护者核对原始 thread/任务终态；本版本不提供强制解锁或自动重放接口。已归档/删除的原生线程不能自动当作新线程继续。

## 系统提示词为什么每轮仍装配

平台在每次 start/resume 时通过 `developerInstructions` 提供版本化固定规则，消息正文只含当轮资料。固定规则负责理解新问题、简短追问、纠正、解决反馈和闲聊；用户附言不能覆盖它。

这比在每条 IM 原文后粘贴规则更清晰、可维护，也避免把规则误当用户内容。它不表示提示词只计费一次、历史无限完整或模型判断绝不出错。原生续接采用 [App Server 官方能力](https://learn.chatgpt.com/docs/app-server)。

FORGE_FLEX 的 `businessInstructions` 仍只用于本次业务表达与 `businessResult` 形状，不是系统指令。需要稳定的日终字段时接入方可以统一配置它，而不是拼接到 `description`。

## 每日归并：用记录核对，不靠模型回忆计数




每日 23:59:59 可触发预归并；完整日窗口是指定时区的 `[当天00:00,次日00:00)`，跨过次日零点后补齐最后一秒和未完成任务。建议日期与时区都显式记录（例如 Asia/Shanghai），按 `(clientId,tenantId,externalUserId,业务日期)` 幂等更新。

建议接入方保存以下归并字段，可通过 `businessInstructions` 要求模型将候选写入 `businessResult`，再由接入方校验：

| 字段 | 用途 |
|---|---|
| issueId / sourceMessageIds | 一个问题关联多条追问，保留原始证据 |
| systemId / module / category | 有依据才分类；未知保留待确认，不猜模块 |
| summary / status | 问题摘要；未解决、已解决、待核实 |
| replyRequestIds / selectedReplyId | 分析结果和所选建议回复的关联 |
| sentMessageIds / sentText | 接入方提供的实际发送事实，与建议回复分开 |
| firstSeenAt / lastSeenAt / businessDate | 新增问题和持续问题区分，跨日追问不重复算新增 |

统计分别展示新增问题数、追问数、未解决问题数，不能把每条 IM 消息计为一个问题。知识库条目应经过事实与适用范围复核，避免将模型猜测或已失败方案沉淀为标准答案。

本次不安装 Forge 每日调度任务、不发送 IM 消息、不自动发布知识库。接入方保留这些业务数据和执行职责。
