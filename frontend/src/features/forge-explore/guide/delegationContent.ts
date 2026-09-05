export const guideSections = [
  ['overview', '能力全景'], ['responsibilities', '两端职责'], ['protocol', '实现原理'],
  ['quickstart', '快速接入'], ['reference', '接口与事件'], ['recovery', '边界与恢复'],
] as const

export const responsibilityRows = [
  ['授权与身份', '绑定参与者、固定会话、能力画像、有效期与额度；管理邀请、暂停、恢复和撤销。', '由宿主完成 Forge 登录、兑换邀请，向 SDK 提供授权令牌。'],
  ['连接与恢复', '签发单次连接 ticket，校验 Origin、协议和授权；提供实时事件与分页历史。', '获取 ticket、建立连接、按水位去重与尝试重连；收到 replayGap 后由接入方补读历史。'],
  ['执行与协作', '校验命令、版本及额度，运行中进入队列；将服务端画像传给 Agent 执行环境。', '提交文字与附件、回答业务问题、中断自己发起的活跃回合；呈现结果与进度。'],
  ['权限与治理', '保留项目、模型、引擎和审批控制；记录授权审计与命令回执。', '不能切换项目、模型或权限模式，也不能代替所有者批准风险工具。'],
] as const

export interface FlowStep { from: string; to: string; label: string; detail: string }
export const protocolScenarios: { id: string; name: string; summary: string; steps: FlowStep[] }[] = [
  { id: 'connect', name: '授权与连接', summary: '先由所有者指定参与者，再把登录身份兑换成只属于这条会话的访问权。', steps: [
    { from: '所有者', to: 'Forge', label: '创建授权与邀请', detail: '指定参与者、执行画像、有效期、回合与输入额度。邀请码最多有效 15 分钟，且不超过授权有效期。' },
    { from: '参与者宿主', to: 'Forge', label: '登录后兑换单次邀请', detail: 'POST /invitations/exchange 使用参与者 Forge 登录令牌。邀请必须属于当前用户；返回 accessToken、grantId、sessionId 和 expiresAt。' },
    { from: 'SDK', to: 'Forge', label: '获取会话摘要与连接 ticket', detail: 'GET /session → POST /connections，Authorization 携带会话授权令牌。ticket 最多 30 秒有效、只能消费一次。' },
    { from: 'SDK', to: 'Forge', label: '建立 WebSocket 并 attach', detail: 'WS 地址只携带 ticket 和 protocolVersion=1.0；attach 带上 lastEventSeq，绑定服务端已授权的会话。' },
    { from: 'Forge', to: 'SDK', label: '返回 ready 与公开事件', detail: 'SDK 在 WebSocket 打开时报告 connected；收到 ready 后，接入方可以展示会话已就绪。' },
  ] },
  { id: 'send', name: '提交与执行', summary: '发送成功只代表命令已发出；回执、运行进度和回合结束是不同阶段。', steps: [
    { from: '参与者', to: 'SDK', label: 'send({ text })', detail: 'SDK 生成 commandId，保存待确认命令并通过 WebSocket 发送；方法返回 commandId，不等待 Agent 完成。' },
    { from: 'SDK', to: 'Forge', label: '校验授权、版本与输入额度', detail: '检查 expectedSessionVersion 和 commandId 回执。若已有回合在执行，本次请求进入既有消息队列。' },
    { from: 'Forge', to: 'Agent', label: '按固定画像执行', detail: '服务端决定执行约束。参与者不能通过消息改变项目、模型、引擎或自动批准模式。' },
    { from: 'Forge', to: 'SDK', label: 'commandAccepted / message / progress', detail: '确认回执用于清理待确认命令；message 包含公开文字，助手文字可能按增量分段到达。' },
    { from: 'Forge', to: '参与者', label: 'completed · 回合结束', detail: '按 stopReason 和会话结果判断下一步。completed 不等于需求已验收，也不等于所有测试通过。' },
  ] },
  { id: 'decisions', name: '业务与风险决策', summary: '业务问题交给参与者澄清，风险操作交给会话所有者审批，两条决策路径分开。', steps: [
    { from: 'Agent', to: '参与者', label: 'businessQuestion · 业务澄清', detail: '公开事件包含 requestId 与问题内容；客户端展示问题并收集真实答案。' },
    { from: '参与者', to: 'Forge', label: 'answerQuestion(requestId, answers)', detail: '服务端确认 requestId 对应当前待答的业务问题；该方法不是通用审批接口。' },
    { from: 'Agent', to: '所有者', label: '风险工具申请', detail: '需要审批的操作在管理端处理；参与者不能调用管理命令或批准风险工具。' },
    { from: '所有者', to: 'Agent', label: '批准、拒绝或接管', detail: '所有者决定是否继续执行。也可以暂停或撤销参与者授权，关闭其公共连接。' },
  ] },
  { id: 'reconnect', name: '断线与恢复', summary: '实时回放有边界；恢复连接、补读历史和重新授权需要分别处理。', steps: [
    { from: 'SDK', to: 'Forge', label: '重新申请 ticket 并连接', detail: '普通断线默认最多尝试 8 次，从 500ms 指数退避到最多 15 秒。到达上限仍为 offline，宿主应提供手动重连。' },
    { from: 'SDK', to: 'Forge', label: '携带事件水位与待确认 commandId', detail: 'SDK 重发未确认命令时保留原 ID；不能把重复调用 send() 当成同一命令重试，因为它会创建新 ID。' },
    { from: 'Forge', to: '接入方', label: 'replayGap · 需要补读历史', detail: '事件超出回放窗口时，由宿主调用 loadHistory()，按消息 ID 对齐历史，不承诺无限事件回放。' },
    { from: 'Forge', to: '接入方', label: '授权失效 · 停止自动重连', detail: 'AUTHENTICATION_REQUIRED、GRANT_REVOKED、GRANT_EXPIRED 是终止状态。重新获取授权后创建新客户端实例。' },
  ] },
]

export const sdkMethods = [
  ['connect()', '获取会话摘要并打开连接；先订阅事件，再调用连接。'],
  ['send({ text, attachments })', '返回 commandId；服务端受理与执行结束分别通过事件反馈。'],
  ['upload(file)', '上传到已授权会话，返回逻辑附件 ID；之后随文字发送。'],
  ['answerQuestion(requestId, answers)', '回答当前业务问题，不能批准风险工具。'],
  ['interrupt()', '仅中断属于本参与者的活跃回合。'],
  ['loadHistory(before?, limit?)', '读取公开 user/assistant 文字；默认 30 条，服务端最多 100 条。'],
  ['subscribe() / subscribeState()', '订阅事件与连接状态；返回取消订阅函数。'],
  ['destroy()', '关闭连接并释放订阅；销毁后重新使用应创建新实例。'],
] as const

export const publicEndpoints = [
  ['POST', '/invitations/exchange', 'Forge 登录令牌', '兑换邀请 → 授权令牌'],
  ['GET', '/session', '会话授权令牌', '固定会话摘要与约束'],
  ['GET', '/messages?before=…&limit=30', '会话授权令牌', '分页公开历史'],
  ['POST', '/attachments', '会话授权令牌', 'multipart 表单字段 file'],
  ['POST', '/connections', '会话授权令牌', '单次 WebSocket ticket'],
  ['WS', '/ws?ticket=…&protocolVersion=1.0', '单次 ticket', 'attach 后交换公开命令与事件'],
] as const

export const recoveryItems = [
  ['邀请不能兑换', 'INVITATION_INVALID', '核对参与者账号、邀请码归属和有效期。邀请码只能使用一次；让所有者重发邀请，不要循环兑换旧码。'],
  ['授权已暂停', 'GRANT_PAUSED', '等待所有者恢复授权后手动重连。暂停限制参与者访问，不代表已中断服务端正在执行的回合。'],
  ['令牌或授权失效', 'AUTHENTICATION_REQUIRED / GRANT_EXPIRED / GRANT_REVOKED', '令牌最长 30 分钟且不超过授权到期时间，SDK 不自动刷新。令牌过期可申请新邀请；授权终止则需新建授权。用新令牌创建新客户端。'],
  ['会话版本冲突', 'SESSION_VERSION_CONFLICT', '重新获取会话摘要并核对结果，再决定是否重发。待确认命令仍带旧版本；失败命令不会自动替你生成一条新请求。'],
  ['输入或回合受限', 'LIMIT_EXCEEDED / INVALID_INPUT', '检查文本 UTF-8 字节数、附件与剩余回合。当前发送实现需要非空文字；附件先 upload，再连同文字 send。额度用尽时由所有者重新授权。'],
  ['历史缺口或主机离线', 'REPLAY_GAP / HOST_OFFLINE', '缺口用 loadHistory() 补齐；离线检查 Forge、Agent 服务及入口转发。超出自动重连次数后提供重试按钮，保留用户草稿。'],
] as const
