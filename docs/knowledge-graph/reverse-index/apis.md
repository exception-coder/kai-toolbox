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
