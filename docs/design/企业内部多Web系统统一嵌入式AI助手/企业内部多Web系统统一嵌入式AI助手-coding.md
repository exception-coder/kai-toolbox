# 企业内部多 Web 系统统一嵌入式 AI 助手编码摘要

> 对应设计：`企业内部多Web系统统一嵌入式AI助手-current.md`。

## 1. 核心规则

- Assistant 会话复用 Claude Chat，不创建第二套 Session、事件回放或消息队列。
- 多连接都可提交；不可立即发送时持久化到既有队列，不返回丢弃语义。
- 服务端认证用户拥有会话；普通用户仅访问本人会话，ADMIN 可访问任意用户会话；客户端上下文中的用户标识不参与授权。
- ADMIN 跨用户放行只作用于会话所有权，不能绕过咨询、评审分享和 Vibe Coding 的执行域绑定规则。
- 显式意图优先，只有 `AUTO` 模式调用分类器。
- Bug、建议草稿确认前不写 ReqPool；确认后原子幂等创建 `PENDING_EXECUTION` 记录。
- Collector 最多保存 100 条，诊断默认上传最近 20 条；Authorization、Cookie、请求体和配置敏感字段默认剔除。
- Bridge 始终从权威 `ChatItem[]` 投影完整用户/助手消息与会话终态；不得以回答文本去重条件拦截 `running=false`。
- Widget 的助手消息使用 `marked + DOMPurify` 安全渲染 Markdown；消息区独立滚动，Composer 固定在 Drawer 底部。
- Clipboard 图片解析、命名、数量/大小校验和对象 URL 生命周期集中在 `imageAttachments.ts`；Widget 只编排预览、移除和草稿恢复，不把 File/Blob 写入持久化状态。
- Transport 在会话 ready 后上传本地图片，再把 `name/path/mime` 引用写入 `send/queue`；上传失败必须回滚乐观消息并把原提交返回 Widget，禁止降级为无图发送。
- Widget 点击发送后必须先在本地消息流追加用户消息，再异步采集上下文；准备、连接、回复、消息处理、后台处理和待确认状态统一禁止再次提交。
- 回合活动状态显示在消息流内，不占用头部上下文条；忙碌期间允许编辑并保留下一条草稿，但发送按钮和键盘提交必须同时锁定。
- 公开 SDK 通过 `AssistantWebSocketTransport` 直接消费统一 WS 协议；不得依赖 React、Router 或 Claude Chat Hook。
- 独立产物同时构建 ESM 与 IIFE；kai-toolbox 内部 Bridge 保留为兼容入口，迁移期间不得复制领域规则。
- 初始隐藏、快捷键和显示密钥属于 Widget 本地交互；不得替代 WS Token、会话所有权或服务端权限校验。
- 拖动逻辑集中在独立位置控制器，入口与对话框共用边界约束和持久化规则；Widget 不复制坐标算法。
- 外部登录必须由宿主显式配置；HTTP CORS 同时受启用开关和精确 Origin 白名单约束，缺省关闭。
- 外部登录只复用 Forge ACCESS Token；密码仅用于单次登录请求，ACCESS Token 与绝对过期时间只保存到当前标签页 `sessionStorage`，不接收、不保存 REFRESH Token。
- 中止动作复用既有 WS `interrupt` 协议；本地准备阶段通过 `AbortSignal` 结束 Provider 收集，Transport 运行阶段只中止当前回合。
- 调试面板只消费结构化脱敏元数据，最多 200 条且不持久化；禁止把 WS URL 查询串、消息正文、上下文值或认证响应写入日志。
- 模块探索缓存只保存同一认证用户的限长最终分析摘要；动态页面快照、具体业务对象和工具原始输出不得进入可复用摘要。
- 模块摘要命中只作为历史线索注入；`sourceRevision` 不一致、超过 7 天或字段校验失败时必须降级为未命中。
- 会话反馈分析只读取持久化水位之后的新增用户消息；不得把完整历史重新提交给分类器。
- 反馈持久化类型固定为 `BUG`、`REQUIREMENT`、`OPTIMIZATION`，分别映射 `BUG_FIX`、`NEW_MODULE`、`MODULE_ADJUST`；不得继续把需求和优化合并成一个数据库分类。
- 分析状态以认证用户和会话隔离；公网候选幂等落库成功后才允许提交本地摘要和水位。
- 公网 MySQL 通过 `AssistantFeedbackStorePort` 隔离；`tool-assistant` 不依赖 Ops 具体类，由 `tool-ops` 适配器从已登记的 `yoooni-one` MySQL 数据源解析凭据并复用 `OpsDataSourcePool` Druid 池直接写库。
- 公网候选禁止保存完整上下文、助手回复、工具输出和认证凭据；只保存限长用户反馈及应用、页面定位元数据。
- 无新增用户消息时直接返回且不调用模型；分析失败时不得推进水位。

## 2. 接口入口

| 接口 | 实现落点 |
|---|---|
| `WS /api/claude-chat/consult/ws` | `ClaudeChatWebSocketHandler`、`ClaudeChatService` |
| `POST /api/assistant/intents/route` | `AssistantIntentController#route` |
| `POST /api/assistant/sessions/{id}/context` | `AssistantSessionController#save` |
| `GET /api/assistant/sessions/{id}/context` | `AssistantSessionController#latest` |
| `POST /api/assistant/drafts` | `AssistantDraftController#create` |
| `POST /api/assistant/drafts/{id}/confirm` | `AssistantDraftController#confirm` |
| `GET /api/assistant/drafts/{id}` | `AssistantDraftController#get` |
| `POST /api/auth/external-login` | `ExternalLoginController#login`；复用账号认证，仅签发 ACCESS Token；仅外部登录开关启用且 Origin 命中白名单时允许跨域 |
| `POST /api/claude-chat/sessions/{id}/attachments` | `AttachmentController#upload`；ACCESS Token、精确 Origin 白名单、会话归属和附件沙箱四重校验 |
| `WS assistantModuleContextResolve` | `AssistantWebSocketCommandHandler` → `AssistantCapabilityPort#resolveModuleContext` |
| `WS assistantModuleContextSave` | `AssistantWebSocketCommandHandler` → `AssistantCapabilityPort#saveModuleContext` |

## 3. 涉及类清单

| 全路径或文件 | 操作 | 职责 |
|---|---|---|
| `com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession` | 修改 | 增加服务端认证用户归属 |
| `com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository` | 修改 | 持久化、查询会话所有者 |
| `com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy` | 新建 | 统一校验会话访问权 |
| `com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService` | 修改 | Open、Attach、Switch、Send 接入所有权校验 |
| `com.exceptioncoder.toolbox.assistant.domain.*` | 新建 | 上下文、意图、草稿及确认结果模型 |
| `com.exceptioncoder.toolbox.assistant.service.*` | 新建 | 草稿与 ReqPool 登记用例编排 |
| `com.exceptioncoder.toolbox.assistant.api.*` | 新建 | kai-toolbox 内部兼容 HTTP 协议适配 |
| `com.exceptioncoder.toolbox.common.assistant.AssistantCapabilityPort` | 新建 | 统一 WS 到 Assistant 业务能力的稳定跨模块端口 |
| `com.exceptioncoder.toolbox.claudechat.service.AssistantWebSocketCommandHandler` | 新建 | 上下文、草稿、确认、用户列表的 WS 协议适配 |
| `frontend/src/assistant-sdk/*` | 新建 | 幂等 SDK、Provider、Collector、Sanitizer 和传输 |
| `frontend/src/assistant-sdk/widget.ts` | 新建 | Shadow DOM Drawer、上下文清单、对话和草稿确认 |
| `frontend/src/assistant-sdk/widgetInteractionState.ts` | 新建 | 将传输状态统一投影为消息流活动提示和发送门禁 |
| `frontend/src/assistant-sdk/widgetPosition.ts` | 新建 | 跨端胶囊与桌面端对话框拖动、边界约束与位置持久化 |
| `frontend/src/assistant-sdk/AssistantBridge.tsx` | 新建 | SDK 与既有咨询 WebSocket、队列、草稿接口接线 |
| `frontend/src/assistant-sdk/AssistantWebSocketTransport.ts` | 新建 | 独立 SDK 的连接、重连、水位、消息和排队状态 |
| `frontend/src/assistant-sdk/imageAttachments.ts` | 新建 | 剪贴板图片提取、前置校验、预览 URL 生命周期和上传 DTO |
| `frontend/src/assistant-sdk/assistantDebugLog.ts` | 新建 | 调试日志容量、脱敏元数据与时间格式化 |
| `com.exceptioncoder.toolbox.common.auth.config.AuthProperties` | 修改 | 增加外部登录 CORS 开关与 Origin 白名单 |
| `com.exceptioncoder.toolbox.common.auth.config.ExternalLoginCorsConfiguration` | 新建 | 只为 Forge 登录路径注册受控 CORS 规则 |
| `frontend/src/assistant-sdk/externalLogin.ts` | 新建 | Forge 登录请求、响应校验和当前标签页 Token 生命周期 |
| `frontend/src/assistant-sdk/widget.ts` | 修改 | 无 Token 时展示登录、提交中、失败和恢复状态 |
| `com.exceptioncoder.toolbox.assistant.domain.AssistantModuleContext` | 新建 | 模块缓存键、摘要、证据版本与有效期模型 |
| `com.exceptioncoder.toolbox.assistant.repository.AssistantModuleContextRepository` | 新建 | 按用户、应用和模块查询及覆盖写入 SQLite |
| `com.exceptioncoder.toolbox.assistant.service.AssistantModuleContextService` | 新建 | 输入校验、版本/TTL 判定和缓存写入用例 |
| `frontend/src/assistant-sdk/moduleContext.ts` | 新建 | 规范化模块键、注入历史摘要和压缩最终回答 |
| `com.exceptioncoder.toolbox.claudechat.service.ClaudeChatConversationDeltaReader` | 新建 | 从 transcript 读取指定水位之后的会话增量，不读取 Git 变化 |
| `com.exceptioncoder.toolbox.assistant.service.AssistantConversationAnalysisService` | 新建 | 校验水位、识别新增用户反馈、维护滚动摘要并原子推进水位 |
| `com.exceptioncoder.toolbox.assistant.repository.AssistantConversationAnalysisRepository` | 新建 | 持久化用户会话分析水位和摘要 |
| `com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort` | 新建 | Assistant 到外部候选反馈库的稳定跨模块写入端口 |
| `com.exceptioncoder.toolbox.ops.service.OpsAssistantFeedbackStoreAdapter` | 新建 | 解析 `yoooni-one` MySQL 数据源并复用 Ops Druid 池幂等写公网 MySQL |
| `tools/tool-ops/src/main/resources/mysql/assistant-feedback-schema.sql` | 新建 | 公网 MySQL 候选反馈表的可追溯 DDL 基线，不进入 SQLite 自动扫描目录 |
| `SystemRepository`、`DatasourceRepository` | 修改 | 按系统编码、环境和 MySQL 类型精确选择已登记连接池 |
| `frontend/src/assistant-sdk/AssistantWebSocketTransport.ts` | 修改 | 正常终态触发增量分析并投影自动识别结果 |
| `frontend/vite.assistant.config.ts` | 新建 | 输出 ESM 与 IIFE 独立产物 |
| `ClientMessage.Queue`、`ServerMessage.QueueAccepted` | 修改 | 同一 WS 上持久化待发送消息并确认接收 |
| `ClientMessage.AssistantModuleContextResolve/Save` | 新建 | 统一 WS 上查询和写回模块探索摘要 |

## 4. 关键方法

```text
ClaudeChatSessionAccessPolicy#canAccessCurrentUser(String sessionId): boolean — ADMIN 访问任意会话，普通用户拒绝访问他人会话
AssistantDraftService#create(CreateDraftCommand command): AssistantDraft — 创建可编辑草稿
AssistantDraftService#confirm(String draftId, String idempotencyKey, Long engineerUserId): AssistantRegistration — 原子登记 ReqPool
AssistantContextService#save(String sessionId, String protocolVersion, Object snapshot): AssistantContextSnapshot — 保存不可变版本化快照
sanitizeEvidence(value, options) — 上传前剔除敏感字段、Bearer 凭据和 URL 敏感查询参数
projectConversationMessages(items, running) — 将既有咨询消息投影为 Widget 用户/助手消息
resolveConversationState(input) — 按错误、连接、待确认、运行、排队和完成优先级解析展示状态
deriveWidgetInteractionState(state, queueSize) — 统一解析消息流活动状态、色调和提交门禁
AssistantWebSocketTransport#submit(submission) — 根据连接和运行态直接发送或持久化排队
AssistantWebSocketTransport#interrupt() — 清理未发送本地请求或复用 WS interrupt 中止当前回合
AssistantPositionController — 统一处理拖动、键盘移动、窗口缩放约束和本地位置恢复
ClaudeChatService#queueUserMessage(ws, message) — 校验当前会话并幂等保存待发送消息
ExternalLoginClient#login(username, password) — 调用受控 Forge 登录接口并保存当前标签页短期授权
AssistantWebSocketTransport#resumeAfterAuthentication() — 登录成功后废弃旧连接版本并立即恢复认证连接
AssistantModuleContextService#resolve(command) — 按认证用户、应用、模块、版本和有效期查询摘要
AssistantModuleContextService#save(command) — 校验客户端摘要并按模块覆盖保存
ClaudeChatConversationDeltaReader#read(String sessionId, long afterSequence): ConversationDelta — 返回水位后的真实会话增量
AssistantConversationAnalysisService#cursor(String sessionId): AnalysisCursor — 返回当前认证用户的持久化分析水位
AssistantConversationAnalysisService#analyze(command): ConversationAnalysis — 对增量用户消息分类并在成功后推进水位
AssistantFeedbackStorePort#saveCandidates(command): void — 批量幂等保存本批次 Bug、需求和优化候选
resolveModuleIdentity(snapshot) — 从 routeName 或规范化 URL 构造稳定模块身份
compressModuleAnalysis(content) — 确定性压缩最终回答，不调用额外模型
```

## 5. 数据结构

- `claude_chat_session.user_id`：可空兼容旧会话；新咨询会话必须写当前认证用户 ID。
- `assistant_draft`：草稿、意图、上下文快照、状态和创建者。
- `assistant_registration`：草稿到 ReqPool 的登记映射，`idempotency_key` 唯一。
- `assistant_module_context_cache`：同一认证用户、应用和模块唯一；保存摘要、页面路由、源码版本和过期时间。
- `assistant_conversation_analysis`：同一认证用户、会话唯一；保存最后成功水位、滚动反馈摘要和更新时间。
- 公网 MySQL `assistant_feedback_candidate`：按来源系统、会话和消息水位唯一，保存 `BUG`、`REQUIREMENT`、`OPTIMIZATION` 候选及其 ReqPool 类型映射；初始状态为 `DETECTED`。
- `req_pool_item.status` 新增允许值 `PENDING_EXECUTION`，不改变存量状态。

## 6. 并发与事务

- 确认登记在同一 SQLite 事务内完成幂等占位、ReqPool 创建和映射落库。
- 相同草稿即使使用不同 `idempotencyKey`，也由草稿唯一约束保证最多创建一条 ReqPool 记录。
- 队列释放继续由 `ClaudeChatService` 的现有会话锁、运行状态和 `queueReleaseSafe` 门禁控制。
- 多标签页不设置单写连接租约。
- 全局 Assistant Bridge 使用 `autoConnect: false`，首次提交才建立咨询 WebSocket。
- Assistant Bridge 按用户持久化 `sessionId`，多标签页复用同一会话的运行状态和服务端待发送队列。
- 独立 Transport 按 `appId + userId` 保存会话、水位和展示消息；重连退避有上限，销毁后停止重连。
- 模块缓存使用 `(creator_user_id, app_id, module_key)` 唯一约束并执行覆盖写入；不跨用户合并，不引入分布式锁。
- 首条直接发送在模块查询返回前暂缓；查询失败按未命中继续。运行中排队消息不等待模块缓存，保持既有 FIFO 契约。
- 会话反馈分析以数据库当前水位为准；重复终态、重连回放和多标签页触发不会重复分类已覆盖消息。
- 公网候选写入采用 MySQL `INSERT ... ON DUPLICATE KEY UPDATE`；外库写成功、本地水位提交失败时可安全重试。
- 不对 SQLite 与公网 MySQL 建分布式事务；顺序固定为“外库幂等候选写入成功，再提交本地水位”，以唯一键消化重试。

## 7. 异常与验证

- 未认证返回 `401`；普通用户访问他人会话返回 `403`；ADMIN 不受会话所有者限制；资源不存在返回 `404`。
- 会话未稳定或正在运行时，消息持久化入队并返回排队状态。
- 覆盖成功、重复确认、并发确认、普通用户越权、ADMIN 跨用户访问、敏感字段、队列恢复和 Provider 超时测试。
- 覆盖回复终态、完整消息投影、Markdown 清洗渲染、固定 Composer 和窄屏 Drawer 的回归与视觉验证。
- 覆盖发送即时投影、慢 Provider 准备态、回复期提交锁定、终态解锁和失败后草稿恢复。
- 覆盖 WS 首连、恢复、流式增量、终态、运行中排队、队列确认、断线重连和独立产物构建。
- 覆盖初始隐藏、默认快捷键、密钥错误/成功、主动打开、拖动边界、位置恢复、移动端胶囊拖动和窄屏对话框固定。
- 覆盖外部登录缺省关闭、Origin 允许/拒绝、登录成功、凭据错误、网络失败、标签页刷新恢复、过期清理和登录后立即重连。
- 覆盖准备阶段中止、运行阶段 interrupt、终态解锁、调试日志容量上限以及日志不含 Token/消息正文。
- 覆盖 routeName/URL 模块键、命中注入、未命中写回、版本失效、TTL 失效、用户隔离、摘要限长和缓存失败降级。
- 覆盖首次分析、无增量短路、从上次水位续扫、失败不推进、多标签页旧水位冲突和自动识别结果投影。
- 覆盖 Bug、需求、优化三分类映射、非反馈不落库、候选唯一键重试、MySQL 失败不推进水位、数据源缺失和表缺失的可观察失败。
