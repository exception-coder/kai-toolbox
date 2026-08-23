# 状态反向索引

## PrdArtifactState

定义：`tools/tool-prd-clarify/src/main/java/com/exceptioncoder/toolbox/prdclarify/domain/PrdArtifactState.java:4`

| 状态 | 写入点 | 读取或决策点 | 含义 |
|---|---|---|---|
| `WRITING` | `PrdArtifactService.java:73`、`PrdArtifactService.java:115` | `PrdArtifactReconciler.java:59` | 账本已登记，文件或状态提交尚未完成 |
| `READY` | `PrdArtifactService.java:82`、`PrdArtifactReconciler.java:83` | `PrdArtifactReconciler.java:56` | 不可变文件存在，摘要已确认 |
| `MISSING` | `PrdArtifactReconciler.java:74` | `PrdArtifactReconciler.java:57` | 账本指向的文件不存在 |
| `CORRUPT` | `PrdArtifactReconciler.java:88` | `PrdArtifactReconciler.java:58` | 文件存在但与账本摘要冲突 |

新增或修改状态时，必须同步检查：领域枚举、仓储映射、核验器 `switch`、状态迁移文档和故障注入测试。

## PrdAiRunStatus

定义：`tools/tool-prd-clarify/src/main/java/com/exceptioncoder/toolbox/prdclarify/domain/PrdAiRunStatus.java:4`

| 状态 | 写入点 | 读取或决策点 | 含义 | 新增态时是否需要补判断 |
|---|---|---|---|---|
| `RUNNING` | `PrdAiRunService.java:40` | `PrdAiRunRepository.java:43` 状态终结条件 | 已登记，模型输出尚未通过裁决 | 是，完成 SQL 必须明确可终结来源态 |
| `SUCCEEDED` | `PrdAiRunService.java:46` | Repository 显式映射、审计查询 | 模型运行且输出通过调用方契约 | 是，统计和重放口径需同步 |
| `FAILED` | `PrdAiRunService.java:51` | Repository 显式映射、失败诊断 | 运行异常或输出契约无效 | 是，失败统计与重试策略需同步 |

状态只允许 `RUNNING -> SUCCEEDED/FAILED`，完成 SQL 使用 `WHERE status = 'RUNNING'` 保证首个终结结果胜出。

## DeliveryClaimStatus / DeliveryEvidenceStatus

定义：`tools/tool-prd-clarify/src/main/java/com/exceptioncoder/toolbox/prdclarify/domain/DeliveryClaimStatus.java`

- Claim 只允许 `COMPLETED/PARTIAL/MISSING`；`COMPLETED` 没有 `VERIFIED` evidence 时在入库前降为 `PARTIAL`。
- Evidence 只允许 `VERIFIED/INVALID_PATH/MISSING_FILE/UNREADABLE/INVALID_RANGE/OUTSIDE_PROJECT`。
- 新增状态时必须同步 Parser 白名单、Verifier 裁决、Repository 映射、风险统计和证据边界测试。

## DeliveryVerificationStatus

定义：`tools/tool-prd-clarify/src/main/java/com/exceptioncoder/toolbox/prdclarify/domain/DeliveryVerificationStatus.java`

| 状态 | 写入点 | 权威评分含义 |
|---|---|---|
| `RUNNING` | 启动前 INSERT | 未评估，不贡献 verification 分 |
| `SUCCEEDED` | exitCode=0 | 同 Git HEAD 时贡献 20 分 |
| `FAILED` | exitCode 非 0 | 贡献 0 分，保留失败证据 |
| `ERROR` | 超时、启动或运行异常 | 贡献 0 分，保留错误摘要 |

任一终态的 `git_head` 与当前 HEAD 不同时派生 `stale=true`，原始状态不覆盖且不贡献分数。

## PrdPromptPurpose

定义：`tools/tool-prd-clarify/src/main/java/com/exceptioncoder/toolbox/prdclarify/domain/PrdPromptPurpose.java:4`

| 枚举值 | 写入点 | 读取或决策点 | 含义 | 新增值时是否需要补判断 |
|---|---|---|---|---|
| `DOC_CHANGE_ANALYZER` | `PrdAiRunService#begin` | `PrdPromptCatalog.java:20`、Analyzer | 文档变更第一阶段分析 | 是，Catalog 必须登记不可变资源 |
| `DOC_CHANGE_VERIFIER` | `PrdAiRunService#begin` | `PrdPromptCatalog.java:22`、Verifier | 文档变更第二阶段复核 | 是，分析协议指纹必须纳入 |
| `PROGRESS_EVALUATION` | `PrdAiRunService#begin` | `PrdPromptCatalog.java:24`、Progress | 进度报告源码核查 | 是，产物元数据和关联测试需同步 |

## LaunchIntentState

定义：`toolbox-common/src/main/java/com/exceptioncoder/toolbox/common/launchintent/domain/LaunchIntentState.java:4`

| 状态 | 写入点 | 读取或决策点 | 含义 |
|---|---|---|---|
| `PENDING` | `LaunchIntentService.java:39` | `LaunchIntentService#getExecutable` | 已持久化，等待消费者执行 |
| `FAILED` | `LaunchIntentService.java:80` | `LaunchIntentService#getExecutable`、Chat 页重试 | 上次执行失败，保留 payload 和错误，可重试 |
| `ACKED` | `LaunchIntentService.java:66` | `LaunchIntentService#getExecutable` | 消费者已完成动作，不允许再次执行 |
| `EXPIRED` | `LaunchIntentService.java:49`、`LaunchIntentService.java:66` | 读取和确认入口 | 超过 30 分钟有效期，不允许执行 |

迁移约束：仅 `PENDING/FAILED` 可执行，ACK 幂等；新增状态时必须同步后端状态机、前端运行时解析、API 文档和生命周期测试。

## RequirementType

定义：`toolbox-common/src/main/java/com/exceptioncoder/toolbox/common/requirement/RequirementType.java:10`

| 枚举值 | 主要写入点 | 读取或决策点 | 含义 |
|---|---|---|---|
| `BUG_FIX` | 公共解析端口、PRD 会话同步 | PRD 默认 2 轮、事实质量现状/期望判断 | 现有行为不符合预期 |
| `MODULE_ADJUST` | 公共解析端口、PRD 会话同步 | PRD 默认 5 轮、现有模块定位规则 | 调整已有能力 |
| `NEW_MODULE` | 公共解析端口、PRD 内部兼容降级 | PRD 默认 8 轮、新模块定位豁免 | 建设全新能力 |
| `UNKNOWN` | 适配器失败、存量空值、PRD 草稿镜像 | UI 待判定与保守评分 | 尚无可靠分类，不得猜测 |

同时维护 `RequirementTypeSource`：`EXPLICIT`、`AI`、`PRD_SESSION`、`UNKNOWN`。新增或修改枚举时必须同步解析白名单、PRD 默认轮数、需求池 DDL/API、前端联合类型与评分测试。

## ReqPlanningAssessmentStatus

定义：`tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/service/ReqPlanningAssessmentService.java`

| 状态 | 写入点 | 读取或决策点 | 含义 |
|---|---|---|---|
| `RUNNING` | `ReqPlanningAssessmentService#prepare` | 部分唯一索引、异步执行、前端轮询 | 运行已登记，模型输出尚未通过服务端契约 |
| `COMPLETED` | Repository 条件完成更新 | 需求中枢规划展示、幂等复用 | 原始输出已保存，归一化工时可消费 |
| `FAILED` | Repository 条件失败更新 | 失败说明与重试入口 | 模型调用或契约校验失败，不阻断核心规格 |

状态只允许 `RUNNING -> COMPLETED/FAILED`；终结 SQL 必须保留 `WHERE status='RUNNING'`，新增状态时同步部分唯一索引、轮询、重试和统计口径。

## PrdDiscoveryRunStatus / Stage

定义：`tools/tool-prd-clarify/src/main/java/com/exceptioncoder/toolbox/prdclarify/service/PrdDiscoveryTaskService.java`

| 状态或阶段 | 写入点 | 读取或决策点 | 含义 |
|---|---|---|---|
| `RUNNING` | 后台运行登记 | 部分唯一索引、启动恢复、前端轮询 | 任务已持久化且尚未终结 |
| `COMPLETED` | 规格发布后条件更新 | 前端读取 `INITIAL_SPEC` | 完成性准则已通过且产物已发布 |
| `FAILED` | 三轮失败或不可恢复异常 | 前端错误说明和重试 | 当前运行终结，不阻止登记新运行 |
| `QUEUED/COLLECTING_EVIDENCE` | 登记、证据准备 | 进度展示 | 尚未调用 Vibe Coding |
| `VIBE_EXECUTING/VALIDATING` | 每轮执行和服务端校验 | 尝试次数、缺口展示 | 最多三轮的生成与裁决阶段 |
| `PUBLISHING` | 校验通过后 | 产物写入故障定位 | 正文已合格，正在发布初始化规格 |

运行状态只允许 `RUNNING -> COMPLETED/FAILED`；终结 SQL 使用 `WHERE status='RUNNING'`。修改阶段或上限时同步 DDL、任务服务、运行 View、前端轮询和恢复测试。
