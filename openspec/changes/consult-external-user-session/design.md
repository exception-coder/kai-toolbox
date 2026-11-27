# 设计

L3：涉及外部用户身份隔离、持久上下文和跨模块执行合同。

以 (clientId, tenantId, externalUserId) 为唯一业务身份。clientId 取认证结果，tenantId 按已有授权检查，用户 ID 由可信接入后端映射。原 conversationId 保留消息来源关联，不用于选择原生线程。现有无状态分析继续可用；有用户 ID 的请求使用持久任务和结果恢复，不将不确定请求自动重发。

持久会话固化 Codex 账号目录和模型。原生 thread ID 由引擎事件保存，调用方不能提交或覆盖；账号更换、历史归档和结果未知均不得悄悄创建替代线程。每个用户同一时刻至多一个受管任务；不同用户仍受全局容量限制。

进行中返回 EXTERNAL_SESSION_BUSY；终态未知并保留原生执行占用时返回 EXTERNAL_SESSION_UNCERTAIN。只有确认正常结束或原生明确返回 interrupted 才释放占用；取消请求已发送不等于取消完成。本次不提供强制解锁或自动重放入口。

平台固定处理规则每轮走 developerInstructions，用户消息只放证据。新增消息动作 REPLY / UPDATE_ONLY / IGNORE；闲聊不等同转人工。问题关联、系统/模块与回复用于接入方归并；模型归纳是候选，不伪称核验事实或已发送回复。

采用官方 App Server 的 thread/start、thread/resume、turn/start；参考 https://learn.chatgpt.com/docs/app-server （2026-11-27 核对）。系统指令每次恢复时重新装配，稳定前缀与不重复拼接原文是分层改进，不保证零 token 成本或无限历史记忆。

适用 OBJ-01、AI-01、EVID-01、FEED-01、IDEM-01：身份来自现有应用认证，错误/未知保留；重复 requestId 返回原任务。无新页面，不涉及键盘焦点或手机布局。SDK 与文档提供图解。

每日归并沿用接入方保存消息和结果的职责，按配置时区使用 [当日00:00,次日00:00) 窗口；23:59:59 是触发时刻而非完整日结束，迟到和仍在分析的结果需要补算。本次不凭会话记忆声称能精确统计所有历史问题。
