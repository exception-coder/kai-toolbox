# 企业内部多 Web 系统统一嵌入式 AI 助手编码摘要

> 对应设计：`企业内部多Web系统统一嵌入式AI助手-current.md`。

## 1. 核心规则

- Assistant 会话复用 Claude Chat，不创建第二套 Session、事件回放或消息队列。
- 多连接都可提交；不可立即发送时持久化到既有队列，不返回丢弃语义。
- 服务端认证用户拥有会话；普通用户仅访问本人会话，ADMIN 可访问任意用户会话；客户端上下文中的用户标识不参与授权。
- ADMIN 跨用户放行只作用于会话所有权，不能绕过咨询、评审分享和 Vibe Coding 的执行域绑定规则。
- 显式意图优先，只有 `AUTO` 模式调用分类器。
- 自动增量识别只静默写三类候选，不投影识别成功提示、模式切换、工程师选择或草稿动作，也不创建 ReqPool；既有草稿确认协议仅作为兼容能力保留。
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
- 反馈描述生成必须使用受控 JSON 字段和服务端固定模板；LLM 输出按分类校验、限长和归一化后再渲染，禁止把模型自由 Markdown 直接落库。
- 历史摘要和用户原话按不可信输入处理，提示词明确忽略其中的任务改写、提示词泄露和工具执行指令；前端展示规范稿时仍执行 Markdown 消毒。
- 结构化描述最多执行两次模型尝试；两次均失败时由代码生成带“待补充”占位的合法模板并记录堆栈，禁止丢弃用户原话或写入不受控模型文本。
- `source_content` 保存用户原话且只读，`ai_optimized_content` 保存不可覆盖的 AI 首次规范稿，`user_rewritten_content` 只保存用户基于 AI 稿的最新改写且允许为空；有效正文取 `COALESCE(user_rewritten_content, ai_optimized_content)`，AI 原稿和每次用户修订继续进入不可变 revision 历史。
- 分析状态以认证用户和会话隔离；公网候选幂等落库成功后才允许提交本地摘要和水位。
- 公网 MySQL 通过 `AssistantFeedbackStorePort` 隔离；`tool-assistant` 不依赖 Ops 具体类，由 `tool-ops` 适配器从已登记的 `yoooni-one` MySQL 数据源解析凭据并复用 `OpsDataSourcePool` Druid 池直接写库。
- 公网候选禁止保存完整上下文、助手回复、工具输出和认证凭据；只保存限长用户反馈及应用、页面定位元数据。
- 无新增用户消息时直接返回且不调用模型；分析失败时不得推进水位。
- 归档回顾只列出当前认证用户的“业务咨询”会话；会话列表和候选列表均必须使用游标分页与服务端上限。
- 归档三标签固定为 `BUG`、`OPTIMIZATION`、`REQUIREMENT`，空分类返回数量 `0`，不再投影为 `SUGGESTION`。
- 候选编辑只允许改正文和三类分类；`requirement_type` 由服务端派生，水位、置信度、原因、页面定位与检出时间不可修改。
- 候选编辑以 `expectedUpdateTime` 执行乐观更新；不命中时返回 `409`，前端保留未提交内容，不得静默覆盖。
- 首次用户修正必须先在同一 MySQL 事务保存 AI 基线版，再保存用户修订版和当前值；任何历史版本不得原地更新。
- 咨询图片必须落 Forge 受控磁盘目录，SQLite 保存逻辑附件与 turnId 关联；公网 MySQL 仅保存候选与逻辑附件 ID 关联，所有层均禁止对外返回绝对磁盘路径。
- 归档图片读取每次校验用户、会话、候选、附件四级关联和规范化路径；前端 Blob object URL 只存活于当前预览并在离开时释放。
- Loader 只负责版本发现与脚本加载，不接收 Assistant 初始化参数，不读取 Token，也不复制 SDK 业务逻辑。
- SDK 版本目录由 IIFE 内容 SHA-256 派生且不可覆盖；渠道清单可更新、可回拨，并对每个产物记录 SHA-384 SRI。
- Loader 与渠道清单使用 `no-cache`，版本化产物使用一年 `public, immutable`；静态资源跨域不放宽任何业务 API 的 Origin 策略。
- 同一页面、同一 Loader URL 与渠道的并发加载必须复用 Promise；失败后删除缓存，下一次调用允许重试。
- 宿主加载失败只记录不含用户数据的错误并保持页面可用；不得因 SDK 发布故障阻塞宿主路由或业务请求。

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
| `GET /api/assistant/feedback-sessions` | `AssistantFeedbackArchiveController#sessions` → `AssistantFeedbackArchiveService#listSessions` |
| `GET /api/assistant/feedback-sessions/{sessionId}/candidates` | `AssistantFeedbackArchiveController#candidates` → `AssistantFeedbackArchiveService#listCandidates` |
| `PATCH /api/assistant/feedback-sessions/{sessionId}/candidates/{candidateId}` | `AssistantFeedbackArchiveController#updateCandidate` → `AssistantFeedbackArchiveService#updateCandidate` |
| `GET /api/assistant/feedback-sessions/{sessionId}/candidates/{candidateId}/revisions` | `AssistantFeedbackArchiveController#revisions` → `AssistantFeedbackArchiveService#listRevisions` |
| `GET /api/assistant/feedback-sessions/{sessionId}/candidates/{candidateId}/attachments/{attachmentId}` | `AssistantFeedbackArchiveController#attachment` → `AssistantFeedbackArchiveService#loadAttachment` |
| `GET /assistant-sdk/loader.js` | Forge 静态资源处理器；固定 Loader，`no-cache` |
| `GET /assistant-sdk/channels/{channel}.json` | Forge 静态资源处理器；渠道清单，`no-cache` |
| `GET /assistant-sdk/releases/{releaseId}/{artifact}` | Forge 静态资源处理器；内容寻址产物，一年 immutable |

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
| `frontend/src/assistant-sdk/widget.ts` | 新建 | Shadow DOM Drawer、上下文清单、对话和静默反馈归档入口 |
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
| `com.exceptioncoder.toolbox.assistant.service.AssistantFeedbackDescriptionGenerator` | 新建 | 将三类反馈生成受控字段草稿并确定性渲染最佳实践 Markdown |
| `com.exceptioncoder.toolbox.assistant.repository.AssistantConversationAnalysisRepository` | 新建 | 持久化用户会话分析水位和摘要 |
| `com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort` | 新建 | Assistant 到外部候选反馈库的稳定跨模块写入端口 |
| `com.exceptioncoder.toolbox.ops.service.OpsAssistantFeedbackStoreAdapter` | 新建 | 解析 `yoooni-one` MySQL 数据源并复用 Ops Druid 池幂等写公网 MySQL |
| `tools/tool-ops/src/main/resources/mysql/assistant-feedback-schema.sql` | 新建 | 公网 MySQL 候选反馈表的可追溯 DDL 基线，不进入 SQLite 自动扫描目录 |
| `SystemRepository`、`DatasourceRepository` | 修改 | 按系统编码、环境和 MySQL 类型精确选择已登记连接池 |
| `frontend/src/assistant-sdk/AssistantWebSocketTransport.ts` | 修改 | 正常终态触发增量分析并投影自动识别结果 |
| `com.exceptioncoder.toolbox.claudechat.service.AssistantFeedbackArchiveService` | 新建 | 编排本人咨询会话、候选摘要、分页与乐观更新 |
| `com.exceptioncoder.toolbox.claudechat.api.AssistantFeedbackArchiveController` | 新建 | 归档查询和编辑的 HTTP 协议适配 |
| `com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository` | 修改 | 按用户、业务咨询分组和游标分页查询归档 |
| `com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort` | 修改 | 扩展用户原话、规范稿、会话摘要、候选分页与条件更新稳定端口 |
| `com.exceptioncoder.toolbox.ops.service.OpsAssistantFeedbackStoreAdapter` | 修改 | 在 yoooni-one Druid 连接池上实现批量摘要、分页及条件更新 |
| `frontend/src/assistant-sdk/feedbackArchive.ts` | 新建 | 归档 AJAX 契约、认证头、分页与错误归一化 |
| `frontend/src/assistant-sdk/widget.ts` | 修改 | 安静的记录入口、三标签、分页、行内编辑及冲突恢复 |
| `com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatAttachmentRepository` | 新建 | 附件安全元数据、会话归属和 turnId 关联 |
| `com.exceptioncoder.toolbox.claudechat.service.AssistantAttachmentArchiveService` | 新建 | 候选图片的四级授权、路径约束与流式读取 |
| `com.exceptioncoder.toolbox.claudechat.service.ClaudeChatConversationDeltaReader` | 修改 | 按 transcript turnId 投影结构化用户附件 |
| `frontend/vite.assistant.config.ts` | 新建 | 输出 ESM 与 IIFE 独立产物 |
| `ClientMessage.Queue`、`ServerMessage.QueueAccepted` | 修改 | 同一 WS 上持久化待发送消息并确认接收 |
| `ClientMessage.AssistantModuleContextResolve/Save` | 新建 | 统一 WS 上查询和写回模块探索摘要 |
| `frontend/src/assistant-loader/loader.ts` | 新建 | 校验渠道清单并以 SRI 加载 IIFE SDK，全局公开 `KaiAssistantLoader.load` |
| `frontend/scripts/publish-assistant-release.mjs` | 新建 | 计算内容地址、生成 manifest 与渠道指针并复制发布产物 |
| `frontend/vite.assistant-loader.config.ts` | 新建 | 将 Loader 构建为无外部依赖 IIFE |
| `com.exceptioncoder.toolbox.web.SpaFallbackConfig` | 修改 | 区分 SDK 版本产物与渠道入口缓存，并允许静态资源跨域读取 |
| `yoooni-one/frontend/src/app/assistantSdkLoader.ts` | 新建 | Yoooni One 运行时加载适配和最小类型边界 |
| `yoooni-one/frontend/src/app/AssistantIntegration.tsx` | 修改 | 使用 Loader 初始化并继续维护页面上下文生命周期 |

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
AssistantFeedbackArchiveService#listSessions(cursor, limit): FeedbackSessionPage — 分页读取本人咨询会话并合并三类数量
AssistantFeedbackArchiveService#listCandidates(sessionId, category, cursor, limit): FeedbackCandidatePage — 校验归属后分页读取单类候选
AssistantFeedbackArchiveService#updateCandidate(sessionId, candidateId, command): FeedbackCandidateView — 校验并条件更新候选
AssistantFeedbackStorePort#summarizeCandidates(query): Map<String, FeedbackCounts> — 单次查询一页会话的三类数量
AssistantFeedbackStorePort#listCandidates(query): CandidatePage — 按所有者、会话、分类和游标查询
AssistantFeedbackStorePort#updateCandidate(command): UpdateResult — 按候选、归属和旧更新时间乐观更新
AssistantFeedbackStorePort#listRevisions(query): RevisionPage — 分页读取 AI 基线和用户修订版
ClaudeChatAttachmentRepository#bindTurn(sessionId, turnId, attachmentIds): void — 在回合启动前持久关联
AssistantAttachmentArchiveService#load(sessionId, candidateId, attachmentId): AttachmentResource — 验证四级归属后读取图片
resolveModuleIdentity(snapshot) — 从 routeName 或规范化 URL 构造稳定模块身份
compressModuleAnalysis(content) — 确定性压缩最终回答，不调用额外模型
AssistantPageIdentity#resolve(appId, pageUrl) — 生成系统和规范化页面 URL 绑定身份
ClaudeChatSessionRepository#findAssistantConversation(userId, appId, pageKey) — 查询当前用户页面固定会话
AssistantConversationHistoryService#messages(sessionId, before, limit) — 校验归属后按逻辑会话读取 transcript 页
AssistantConversationViewport — 渐进加载并只挂载消息可视窗口
loadAssistantSdk(options): Promise<LoadedAssistantSdk> — 读取渠道清单、校验契约并只加载一次指定 SDK
publishAssistantRelease(options): ReleaseManifest — 以内容 hash 生成不可变目录、SRI 与渠道清单
loadKaiAssistantRuntime(loaderUrl, channel): Promise<AssistantRuntime> — Yoooni One 注入中心 Loader 并返回运行时 SDK
```

## 5. 数据结构

- `claude_chat_session.user_id`：可空兼容旧会话；新咨询会话必须写当前认证用户 ID。
- `claude_chat_session.assistant_app_id`：彩虹胶囊来源系统；仅业务咨询绑定会话填写。
- `claude_chat_session.assistant_page_key`：规范化页面 URL 的稳定键，与认证用户和系统组成部分唯一约束。
- `claude_chat_session.assistant_page_url`：最后一次声明的规范化 URL，仅用于诊断和界面上下文，不参与授权。
- `assistant_draft`：草稿、意图、上下文快照、状态和创建者。
- `assistant_registration`：草稿到 ReqPool 的登记映射，`idempotency_key` 唯一。
- `assistant_module_context_cache`：同一认证用户、应用和模块唯一；保存摘要、页面路由、源码版本和过期时间。
- `assistant_conversation_analysis`：同一认证用户、会话唯一；保存最后成功水位、滚动反馈摘要和更新时间。
- 公网 MySQL `assistant_feedback_candidate`：按来源系统、会话和消息水位唯一，保存 `BUG`、`REQUIREMENT`、`OPTIMIZATION` 候选及其 ReqPool 类型映射；初始状态为 `DETECTED`。
- `assistant_feedback_candidate` 补充 `(creator_user_id, session_id, feedback_category, detected_at, id)` 索引；正文明确拆为只读的 `source_content`、只读的 `ai_optimized_content` 和可空可编辑的 `user_rewritten_content`，编辑时只更新 `feedback_category`、`requirement_type`、`user_rewritten_content` 和 `update_time`。
- 公网 MySQL `assistant_feedback_candidate_revision`：按 `(candidate_id, revision_no)` 唯一，保存 `AI` 原稿和每次 `USER` 修订的类型、派生需求类型、正文、编辑人和时间。
- 公网 MySQL `assistant_feedback_candidate_attachment`：按 `(candidate_id, attachment_id)` 唯一，只保存逻辑 ID、文件名、MIME、大小和时间，不保存磁盘绝对路径或二进制。
- SQLite `claude_chat_attachment`：保存附件归属、安全元数据和受控目录内的相对存储键。
- SQLite `claude_chat_turn_attachment`：按 `(session_id, turn_id, attachment_id)` 唯一，保存用户轮次和附件的结构化关联。
- `req_pool_item.status` 新增允许值 `PENDING_EXECUTION`，不改变存量状态。

## 6. 并发与事务

- 确认登记在同一 SQLite 事务内完成幂等占位、ReqPool 创建和映射落库。
- 相同草稿即使使用不同 `idempotencyKey`，也由草稿唯一约束保证最多创建一条 ReqPool 记录。
- 队列释放继续由 `ClaudeChatService` 的现有会话锁、运行状态和 `queueReleaseSafe` 门禁控制。
- 多标签页不设置单写连接租约。
- 全局 Assistant Bridge 使用 `autoConnect: false`，首次提交才建立咨询 WebSocket。
- Assistant Bridge 按用户持久化 `sessionId`，多标签页复用同一会话的运行状态和服务端待发送队列。
- 独立 Transport 只按 `appId + userId + pageKey` 保存待发送、水位和草稿幂等状态；会话绑定与历史消息以服务端为事实源，重连退避有上限，销毁后停止重连。
- 页面绑定创建使用数据库部分唯一索引兜底；多标签页并发首次打开时只保留一条绑定，冲突连接重新读取并 Attach 获胜会话。
- 历史每页最多 50 条、默认 30 条；前端只在顶部阈值触发单飞请求，向前追加后按锚点恢复滚动位置。
- 模块缓存使用 `(creator_user_id, app_id, module_key)` 唯一约束并执行覆盖写入；不跨用户合并，不引入分布式锁。
- 首条直接发送在模块查询返回前暂缓；查询失败按未命中继续。运行中排队消息不等待模块缓存，保持既有 FIFO 契约。
- 会话反馈分析以数据库当前水位为准；重复终态、重连回放和多标签页触发不会重复分类已覆盖消息。
- 公网候选写入采用 MySQL `INSERT ... ON DUPLICATE KEY UPDATE`；外库写成功、本地水位提交失败时可安全重试。
- 不对 SQLite 与公网 MySQL 建分布式事务；顺序固定为“外库幂等候选写入成功，再提交本地水位”，以唯一键消化重试。
- 归档标签数量对一页会话 ID 执行一次批量聚合，禁止每会话单独查询。候选编辑使用 `update_time` 乐观条件，不引入跨库事务。
- 候选当前值、AI 基线和用户修订版在同一 MySQL 事务内写入；修订版本号在候选行锁内计算，乐观冲突时整个事务回滚。
- 附件二进制和 SQLite 元数据不与公网 MySQL 候选关联建分布式事务；候选关联写入可幂等重试，磁盘缺失时返回不可用状态而不伪造内容。

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
- 覆盖首次分析、无增量短路、从上次水位续扫、失败不推进、多标签页旧水位冲突，以及自动识别成功不产生提示、模式切换或草稿控件。
- 覆盖 Bug、需求、优化三分类映射、非反馈不落库、候选唯一键重试、MySQL 失败不推进水位、数据源缺失和表缺失的可观察失败。
- 覆盖归档用户隔离、会话游标分页、三标签零值、候选分类分页、正文/类型修改、派生需求类型、越权、乐观冲突、MySQL 故障和外部 Origin 拒绝。
- 前端在桌面端和约 `375px` 移动端验证记录返回、三标签溢出、分页、编辑保存、冲突保留草稿、空态重试及焦点恢复。
- 覆盖图片落盘、元数据与 turnId 关联、候选关联、授权读取、路径穿越拒绝、文件缺失恢复态、Blob URL 释放，以及首次 AI 基线留档、多次用户修订和并发冲突回滚。
- 覆盖不同用户、不同 appId、不同规范化 URL 的会话隔离，同键刷新/多标签复用，参数顺序归一化和敏感查询参数过滤。
- 覆盖最近页首载、上拉分页、并发请求去重、历史失败重试、transcript 缺失、向前追加不跳动、贴底跟随和长会话 DOM 节点上限。
- 覆盖 Loader 渠道清单成功、HTTP 失败、JSON 契约失败、SRI 脚本失败、并发复用、失败后重试和已存在 SDK 快速返回。
- 覆盖发布脚本内容地址稳定性、SRI 正确性、渠道选择、路径约束和重复构建幂等。
- 覆盖 Yoooni One 初始化一次、路由上下文更新、卸载销毁、Loader 失败不影响页面，以及构建产物不再包含 vendor SDK 实现。
