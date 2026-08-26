# API 反向索引

## LaunchIntent

定义：`toolbox-common/src/main/java/com/exceptioncoder/toolbox/common/launchintent/api/LaunchIntentController.java:25`

| API | 写入/读取 | 前端调用者 | 决策影响 |
|---|---|---|---|
| `POST /api/launch-intents` | 新建 `PENDING` | 项目工作台、知识图谱、PRD、新模块入口 | 创建失败时不得导航，避免上下文丢失 |
| `GET /api/launch-intents/{id}` | 读取并惰性过期 | `ChatPage` | 仅 `PENDING/FAILED` 返回可执行 payload |
| `POST /api/launch-intents/{id}/ack` | 写 `ACKED` | `ChatPage` | 打开、发消息、写草稿成功后才调用 |
| `POST /api/launch-intents/{id}/fail` | 写 `FAILED/last_error` | `ChatPage`、PRD 解绑失败补偿 | 保留同一 ID 供重试和诊断 |

接口契约变更时必须同步 `frontend/src/shell/launch-intent`、所有生产者、Chat 消费器、API 设计文档和状态机测试。

## ReqPool 需求类型

定义：`tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/api/ReqPoolController.java:58`

| API | 写入/读取 | 前端调用者 | 决策影响 |
|---|---|---|---|
| `POST /api/reqpool/items` | 创建并解析独立需求，或采用已确认 PRD 类型 | 需求池快速登记、PRD 自动登记 | 响应携带类型、来源、置信度 |
| `PUT /api/reqpool/items/{id}` | 标题/描述变化时重新解析 | 需求池编辑 | 无关字段编辑不得触发分类 |
| `GET /api/reqpool/items[/{id}]` | 读取并归一化存量空值 | 需求池列表和详情 | 前端不得再做文本推断 |
| `POST /api/reqpool/items/{id}/link-prd` | 采用非草稿 PRD 的确认类型 | 需求池关联 PRD | 草稿占位类型不得升级为事实 |
| `POST /api/reqpool/sync-from-prd` | 幂等回写类型和来源 | 需求池自动同步 | PRD 会话分类优先且不重复调用 Agent |

接口变更时必须同步 `ReqItemView`、`frontend/src/features/reqpool/types.ts`、事实质量评分、API 设计文档和三条写路径测试。

## ReqPool AI 洞察

定义：`tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/api/ReqPoolController.java:329`

| API | 写入/读取 | 前端调用者 | 决策影响 |
|---|---|---|---|
| `POST /api/reqpool/items/{id}/analyze` | 校验后插入单条历史并更新兼容投影 | 需求详情“重新分析” | 非法模型 JSON 不得落库 |
| `POST /api/reqpool/portfolio-analyze` | 校验完整 ID 与排名集合后单事务批量提交 | 需求中枢“AI 组合排序” | 任一非法项必须整批回滚 |
| `GET /api/reqpool/items[/{id}]` | 读取最新历史并计算事实与组合新鲜度 | 列表、详情、优先排序 | `stale=true` 的洞察不得参与权威排序和统一判定 |

接口出参变化时必须同步 `ReqItemView`、`ReqItemViewAssembler`、前端 `ReqItemView`、过期提示和排序降级测试。

## ReqPool 初始化规格规划评估

定义：`tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/api/ReqPoolController.java`

| API | 写入/读取 | 前端调用者 | 决策影响 |
|---|---|---|---|
| `GET /api/reqpool/items/{id}/planning-assessment` | 读取最近一次规划运行 | 需求详情规划评估区 | `RUNNING` 继续轮询；`FAILED` 展示原因；`COMPLETED` 只消费归一化结果 |
| `POST /api/reqpool/items/{id}/planning-assessment/retry` | 复用冻结输入登记新运行 | 失败态“重新评估” | 相同成功/活动运行幂等复用，不重复调用 Agent |
| `GET /api/reqpool/items[/{id}]` | 装配最近规划运行 | 需求列表与详情 | 列表显示规划工时区间，旧粗估仍作为后续交付估算 |

接口契约变更时必须同步 `ReqPlanningAssessmentView`、`ReqItemViewAssembler`、前端规划类型/解析器、轮询条件与归一化器测试。

## 初始化规格后台探索

定义：`tools/tool-prd-clarify/src/main/java/com/exceptioncoder/toolbox/prdclarify/api/PrdClarifyController.java`

| API | 写入/读取 | 前端调用者 | 决策影响 |
|---|---|---|---|
| `POST /api/prd-clarify/sessions/{id}/discover` | 幂等登记 `RUNNING` 后立即返回 | `usePrdClarifySession` 开始/重试探索 | 不得等待证据或 Agent；已有活动运行必须复用 |
| `GET /api/prd-clarify/sessions/{id}/discovery-run` | 读取最近运行 | `usePrdClarifySession` 1.5 秒轮询 | `COMPLETED` 读取已发布规格；`FAILED` 展示缺口和恢复动作 |

接口契约变更时必须同步 `PrdDiscoveryRunView`、前端运行类型、轮询终止条件、后台任务测试和探索流程 API 文档。

## Delivery 证据与验证

定义：`tools/tool-prd-clarify/src/main/java/com/exceptioncoder/toolbox/prdclarify/api/PrdDeliveryController.java`

| API | 写入/读取 | 前端调用者 | 决策影响 |
|---|---|---|---|
| `GET /api/prd-clarify/delivery-overview` | 读 claim、run 并生成权威评分 | Delivery Center、ReqPool 交付节点 | 前端只消费 `overallProgressVariants`，不复制权重 |
| `POST /api/prd-clarify/delivery-overview/{sessionId}/verification-runs` | 插入 RUNNING 并异步执行白名单命令 | `AiInspector` | 请求只能提交 `commandId`；并发运行返回 409 |

契约变更时必须同步 `DeliveryOverviewView`、前端 `types.ts/api.ts`、白名单配置、评分测试与运行生命周期测试。

## Vibe Coding 计划评审关联

定义：`tools/tool-claude-chat/src/main/java/com/exceptioncoder/toolbox/claudechat/api/ReviewSpaceController.java:73`

| API | 写入/读取 | 前端调用者 | 决策影响 |
|---|---|---|---|
| `GET /api/claude-chat/sessions/{sessionId}/review-relations` | 读取全部关联评审并恢复原 `sharePath` | `ReviewRelationBar` | 展示原始局域网地址；密文缺失或无效时只显示不可恢复说明 |
| `POST /api/claude-chat/reviews/{id}/reissue` | 原子轮换摘要、密文与有效期 | `ReviewRelationBar` | 仅作为换新/替代操作，成功后旧链接立即失效 |
| `GET /api/claude-chat/reviews/public/{token}` | 以摘要校验公开访问，并为旧记录补存密文 | 公开评审页 | 补存必须以当前摘要为条件，避免覆盖并发换新的 token |

契约变更时必须同步 `ReviewRelationContext`、令牌密文边界、历史链接交互和原链接/旧数据兼容测试。

## Vibe Coding 项目模块目录

定义：`tools/tool-claude-chat/src/main/java/com/exceptioncoder/toolbox/claudechat/api/WorkspaceController.java:70`

| API | 写入/读取 | 前端调用者 | 决策影响 |
|---|---|---|---|
| `GET /api/claude-chat/workspaces/modules?path=...` | 读取 `modules.json`，缺失时降级为目录扫描 | 项目工作台、会话模块选择、`ReviewShareDialog` | `ModuleView.key` 是分享评审的稳定模块索引；`fromKnowledge=false` 时只能标记为降级基线，且分享前必须人工确认 |

接口契约变更时必须同步 `ProjectModulesResponse.ModuleView`、前端 `ProjectModule`、工作区扫描测试和计划评审上下文快照。

## Assistant 模块探索摘要命令

定义：`tools/tool-claude-chat/src/main/java/com/exceptioncoder/toolbox/claudechat/api/dto/ClientMessage.java`

| WS 命令 | 写入/读取 | SDK 调用者 | 决策影响 |
|---|---|---|---|
| `assistantModuleContextResolve` | 按当前认证用户、`appId`、`moduleKey` 读取 | `AssistantWebSocketTransport#prepareModuleContext` | 仅 TTL 有效且 `sourceRevision` 匹配时命中；失败或 2 秒超时必须降级为实时探索 |
| `assistantModuleContextSave` | 原子新增或刷新模块摘要 | `AssistantWebSocketTransport#saveActiveModuleExploration` | 仅正常完成的缓存未命中回合写入；中断、失败和空回答不得写入 |

契约变更时必须同步 `AssistantCapabilityPort`、`AssistantWebSocketCommandHandler`、SDK 模块键与注入逻辑、API 设计文档和协议测试。

## Assistant 页面会话绑定与历史 API

定义：`tools/tool-claude-chat/src/main/java/com/exceptioncoder/toolbox/claudechat/api/AssistantConversationController.java`

| API / WS 命令 | 写入/读取 | SDK 调用者 | 决策影响 |
|---|---|---|---|
| WS `open.assistantAppId/assistantPageKey/assistantPageUrl` | 按认证用户、系统和规范化页面键查找或创建固定会话 | `AssistantWebSocketTransport#connect` | 同一三元组必须稳定返回同一 `sessionId`；并发首次打开由数据库唯一索引收敛 |
| `GET /api/assistant/conversations/{sessionId}/messages?limit=30&before=...` | 仅会话所有者读取 transcript 的最近窗口或更早窗口 | `AssistantWebSocketTransport#loadHistory` | 首屏优先近期消息；`nextBefore` 驱动渐进加载，不得一次返回完整长会话 |

契约变更时必须同步 `ClientMessage.Open`、绑定服务、历史服务、外部登录 CORS、SDK 页面键归一化、窗口化消息视图与协议测试。

## 视频库独立扫描 API

定义位置：`tools/tool-treesize/src/main/java/com/exceptioncoder/toolbox/treesize/api/VideoProcessingController.java`

**端点**：`GET/POST /api/treesize/videos/scan-roots`、`DELETE /api/treesize/videos/scan-roots/{id}`、`POST /api/treesize/videos/directory-scan/start|stop`、`GET /api/treesize/videos/directory-scan/status`

**调用方**：`frontend/src/features/video-library/components/VideoProcessingToolbar.tsx`，负责登记目录、启动扫描和轮询渐进状态。

**变更影响**：根目录字段或扫描状态结构变化时同步修改 `frontend/src/features/video-library/api.ts`；播放兼容依赖列表项 `scanId` 保存根目录 ID。
