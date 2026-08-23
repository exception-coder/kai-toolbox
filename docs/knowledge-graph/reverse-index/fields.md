# 字段反向索引

## prd_artifact

定义：`tools/tool-prd-clarify/src/main/resources/db/prd-schema.sql:119`

| 字段 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `id` | `PrdArtifactService.java:72` | `PrdArtifactRepository.java:78`、状态更新 |
| `session_id` | `PrdArtifactService.java:72` | `PrdArtifactRepository.java:42`、版本分配 |
| `artifact_type` | `PrdArtifactService.java:72` | `PrdArtifactRepository.java:42`、兼容投影分支 |
| `version` | `PrdArtifactService.java:70` | 最新版本查询、不可变路径生成 |
| `state` | 写入服务、启动核验器 | 核验汇总与状态诊断 |
| `relative_path` | `PrdArtifactType#versionedRelativePath` | `PrdFileStore#inspect`、孤儿比对 |
| `sha256` | 文件写入结果、启动核验 | 文件一致性判断 |
| `size_bytes` | 文件写入结果、启动核验 | 文件元数据与诊断 |
| `source_hash` | `PrdArtifactService.ArtifactMetadata` | 预留给输入可复现与过期判断 |
| `prompt_version` | `PrdArtifactService.ArtifactMetadata` | 预留给 Prompt 审计 |
| `last_error` | 写入失败、缺失或损坏核验 | 运维诊断 |
| `created_at` | 新建版本 | 历史排序与审计 |
| `updated_at` | 新建及每次核验 | 状态索引与诊断 |

修改字段定义时，必须同步检查 DDL、`PrdArtifact`、`PrdArtifactRepository` 的显式列映射、写入服务、核验器和测试建表 SQL。

## prd_ai_run

定义：`tools/tool-prd-clarify/src/main/resources/db/prd-schema.sql:142`

| 字段 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `id` | `PrdAiRunService#begin` 生成 UUID | Repository 状态终结、候选/产物绑定 |
| `session_id` | Progress 写源会话；Analyzer/Verifier 通过候选关联 | 按会话与 purpose 查询运行历史 |
| `purpose` | `PrdPromptDefinition.purpose` | Prompt 类型统计与历史重放选择 |
| `prompt_version` | `PrdPromptCatalog` 不可变注册项 | Prompt 升版审计与产物复现 |
| `prompt_sha256` | Catalog 对实际 UTF-8 资源计算 | 识别同版本内容漂移 |
| `input_fingerprint` | `PrdAiRunService#begin` 对最终 user prompt 计算 | 输入相同度核验；不暴露原文 |
| `engine`、`model` | 非敏感执行配置 | 运行环境审计 |
| `candidate_id` | `PrdDocChangeAnalysisService` 保存候选后补写 | 查询 Analyzer/Verifier 两阶段运行 |
| `artifact_id` | Progress 产物 READY 后补写 | 查询产物对应运行 |
| `status` | begin 写 `RUNNING`；succeed/fail 终结 | 运行成功率、失败诊断 |
| `output_sha256` | 终结时对模型输出计算 | 输出一致性核验；不保存正文 |
| `last_error` | 失败时写入最多 500 字摘要 | 运维诊断，不得包含鉴权信息 |
| `started_at`、`finished_at` | 运行生命周期 | 耗时与未终结运行识别 |
| `created_at`、`updated_at` | 插入及状态/关联更新 | 稳定排序与审计 |

修改字段时必须同步 DDL、`PrdAiRun`、Repository 显式列映射、生命周期服务、Prompt/输入/输出隐私约束和临时 SQLite 测试。

## delivery_claim / delivery_claim_evidence

定义：`tools/tool-prd-clarify/src/main/resources/db/prd-schema.sql`

| 字段组 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `artifact_id/claim_id/claim_status/test_item` | `DeliveryClaimLedgerService#save` | `DeliveryOverviewService#claimAssessment` 实现分与测试口径 |
| `relative_path/line_start/line_end/symbol` | `DeliveryEvidenceVerifier` 裁决后写入 | 证据追溯和无效证据计数 |
| `file_sha256/validation_status/last_error` | 服务端读取实际文件后写入 | `COMPLETED` 降级、confidence 和诊断 |

修改字段时必须同步领域 record、Repository 显式列映射、Prompt JSON 契约、路径安全测试和 overview DTO。

## delivery_verification_run

定义：`tools/tool-prd-clarify/src/main/resources/db/prd-schema.sql`

| 字段组 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `session_id/command_id/git_head` | `DeliveryVerificationService#start` | 会话归属、白名单追溯、stale 判定 |
| `status/exit_code/test_count` | 运行终结条件 UPDATE | 硬验证 20 分和运行状态展示 |
| `output_summary/last_error` | 输出有界脱敏后写入 | 诊断；不得包含环境变量或绝对项目路径 |

修改字段时必须同步域对象、条件终结 SQL、DTO、脱敏约束与 SQLite 并发运行测试。

## platform_launch_intent

定义：`toolbox-common/src/main/resources/db/launch-intent-schema.sql:1`

| 字段 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `id` | `LaunchIntentService#create` | URL 查询参数、四个 LaunchIntent API、仓储主键查询 |
| `protocol_version` | 创建接口 | 前端 `parseLaunchIntent` 兼容性校验 |
| `intent_type` | 创建接口 | Chat 页类型分流 |
| `payload_json` | 创建接口 | Chat 页打开草稿、打开并发送或打开面板 |
| `state` | 创建、失败、确认、惰性过期 | 可执行性与重试决策 |
| `last_error` | 失败与过期迁移 | Chat 页诊断、后续运维排查 |
| `created_at` | 创建 | 审计与响应展示 |
| `expires_at` | 创建 | 读取、确认时的过期判定 |
| `acknowledged_at` | 成功确认 | 消费审计 |
| `updated_at` | 每次状态迁移 | 状态审计与排查 |

修改字段时必须同步 DDL、`LaunchIntent`、仓储显式列映射、HTTP View、TypeScript 运行时解析和临时 SQLite 测试。

## req_pool_item 需求类型字段

定义：`tools/tool-reqpool/src/main/resources/db/reqpool-schema.sql:17`

| 字段 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `req_type` | `ReqRequirementTypeService.java:28`、`ReqPoolController.java:390` PRD 同步 | `ReqItemRepository.java:28`、`ReqItemView`、`factQuality.ts` |
| `req_type_source` | 独立解析或 PRD 同步 | API 来源标签、事实可信度解释 |
| `req_type_confidence` | 公共解析结果或 PRD 确认值 | `ReqItemView` 边界归一化、后续审计 |

修改字段时必须同步公共枚举/端口、DDL、`ReqItem`、Repository 显式写入参数、`ReqItemView`、PRD 同步和前端类型。

## req_pool_insight

定义：`tools/tool-reqpool/src/main/resources/db/reqpool-schema.sql:40`

| 字段 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `id` | `ReqInsightApplicationService.java:77`、`:108` 生成历史身份 | `ReqInsightRepository.java:57` 最新记录稳定排序 |
| `item_id` | 单条或组合分析输入 | `ReqItemViewAssembler` 批量装配、删除需求时清理历史 |
| `analysis_type` | `ITEM` 或 `PORTFOLIO` | 前端生成类型标签、组合集合失效判断 |
| `prompt_version` | focused application 常量 | API 审计展示和后续重放依据 |
| `source_hash` | `ReqInsightFingerprint.java:17` | `ReqItemViewAssembler.java:50` 的 `SOURCE_CHANGED` 判定 |
| `portfolio_set_hash` | `ReqInsightApplicationService.java:103` | `ReqItemViewAssembler.java:54` 的 `PORTFOLIO_CHANGED` 判定 |
| `payload_json` | `ReqInsightValidator` 完整校验后写入 | `ReqInsightPersistenceService.java:24` 兼容投影与历史回放 |
| `engine`、`model` | Agent 调用配置 | 生成环境审计；默认模型时 `model` 为空 |
| `created_at`、`updated_at` | 洞察短事务创建 | 最新历史选择、API 生成时间展示 |

修改字段时必须同步 DDL、`ReqInsight`、Repository 显式列映射、视图装配器、API 类型和临时 SQLite 事务测试。

## prd_session 来源需求字段

定义：`tools/tool-prd-clarify/src/main/resources/db/prd-schema.sql`

| 字段 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `source_req_item_id` | 从需求中枢启动探索时由 `CreateSessionRequest` 写入 | `PrdDiscoveryService#confirm` 组装规划请求；需求中枢优先复用原根需求 |

修改字段时必须同步 `PrdSession`、创建 DTO、Repository 显式列映射、前端会话创建请求与生命周期测试。

## req_pool_planning_assessment

定义：`tools/tool-reqpool/src/main/resources/db/reqpool-schema.sql`

| 字段组 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `item_id/prd_session_id` | `ReqPlanningAssessmentService#prepare` | 需求详情装配、按规格会话幂等查找 |
| `input_hash/input_snapshot` | 确认初始化规格时冻结 | 相同输入复用、重试、后续离线评测 |
| `criteria_version/prompt_version` | 固定准则与 Prompt 常量 | 不同评测版本对比、活动运行唯一索引 |
| `raw_output/payload_json` | Agent 原始返回、服务端归一化结果 | 模型质量回放与业务展示严格分离 |
| `status/last_error` | 登记 `RUNNING`，条件终结为 `COMPLETED/FAILED` | 轮询、失败诊断和重试入口 |
| `engine/model/started_at/completed_at` | 运行上下文与生命周期 | 执行环境、耗时和成功率评测 |

修改字段时必须同步领域对象、Repository 显式列映射、部分唯一索引、归一化器、API/TypeScript 类型和删除级联逻辑。

## prd_discovery_run

定义：`tools/tool-prd-clarify/src/main/resources/db/prd-schema.sql`

| 字段组 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `session_id/status/stage/progress` | `PrdDiscoveryTaskService` 登记和推进 | 单会话活动唯一索引、前端轮询和恢复 |
| `attempt/max_attempts` | 每轮 Vibe Coding 执行前更新 | ReAct 上限、进度与用户说明 |
| `criteria_version/prompt_version/input_hash` | 登记时冻结 | 质量准则审计、输入复现与后续评测 |
| `vibe_session_id/trace_id` | `AgentOneShotRunner.ObservedResult` | 执行关联、遥测排障和界面追踪 |
| `last_output/validation_json/last_error` | 每轮输出与校验后更新 | 下一轮修复上下文、失败诊断；正文不通过运行 API 暴露 |
| `started_at/completed_at/created_at/updated_at` | 运行生命周期 | 耗时、恢复和历史顺序 |

修改字段时必须同步 `PrdDiscoveryRun`、Repository 显式列映射、部分唯一索引、运行 View、前端类型和后台任务测试。

## claude_chat_review_space 分享令牌字段

定义：`tools/tool-claude-chat/src/main/resources/db/claude-chat-schema.sql:46`

| 字段 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `token_hash` | 创建、换新链接；公开旧链接访问时作为条件 | 公开链接访问校验、补存密文的并发保护 |
| `token_ciphertext` | 创建、换新链接；旧链接成功访问后补存或修复 | 内部评审关联投影恢复原 `sharePath`；公开接口不得返回 |
| `expires_at/status` | 创建、换新、撤销 | 原链接有效/过期/撤销展示和公开访问判定 |

修改令牌字段时必须同步 DDL、启动迁移、`ReviewSpace`、Repository 显式列映射、AES-GCM 服务、关联 API 与前端历史列表测试。

## assistant_module_context_cache

定义：`tools/tool-assistant/src/main/resources/db/assistant-schema.sql`

| 字段 | 主要写入点 | 主要读取或决策点 |
|---|---|---|
| `id` | `AssistantModuleContextService#save` 生成 UUID | Repository 主键与审计 |
| `creator_user_id` | 当前 `AuthContext` | 用户隔离查询与唯一键 |
| `app_id/module_key` | SDK 稳定模块身份 | 缓存定位与唯一键；`routeName` 优先于去参数化 URL |
| `route` | SDK 当前页面 URL | 诊断信息，不参与唯一定位 |
| `source_revision` | 宿主可选发布/结构版本 | 非空请求版本变化时强制未命中 |
| `summary_text` | 正常完成回答的确定性有界压缩 | 以 `historical-clue` 注入后续上下文，最长 6000 字符 |
| `expires_at` | 保存时间加 7 天 | 过期摘要不得命中 |
| `create_time/update_time` | 首次创建或原子刷新 | 返回更新时间与稳定覆盖审计 |

修改字段时必须同步 DDL、`AssistantModuleContext`、Repository 显式列映射、服务校验、WS 契约、SDK 注入逻辑和 SQLite 测试。

## `video_scan_root` 表

定义位置：`tools/tool-treesize/src/main/resources/db/treesize-schema.sql`

| 字段 | 读点 | 写点 | 同步报文是否包含 | 备注 |
|---|---|---|---|---|
| `id` / `path` | `VideoScanRootRepository.findAll`、`PathAccessGuard.resolve` | `VideoScanRootRepository.insert` | 否 | 自主扫描、播放和删除的路径授权边界 |
| `status` | `VideoProcessingController.scanRoots` | `VideoScanRootRepository.markRunning/markDone/markFailed` | 否 | `IDLE/RUNNING/DONE/FAILED` |
| `last_scan_at` / `video_count` / `total_size` | 视频库根目录 API | `VideoScanRootRepository.markDone` | 否 | 最近一次完整扫描统计 |

## `treesize_video.source_scan_id` 独立扫描语义

定义位置：`tools/tool-treesize/src/main/resources/db/treesize-schema.sql`

| 字段 | 读点 | 写点 | 同步报文是否包含 | 备注 |
|---|---|---|---|---|
| `source_scan_id` | `VideoTableRepository.findLibraryVideos`、播放器 `scanId` | `VideoTableRepository.upsertScannedBatch` / 旧 `VideoSyncService` | 是，映射为 `VideoLibraryItem.scanId` | 新记录保存 `video_scan_root.id`，历史记录保存 `treesize_scan.id` |
| `last_synced_at` | `VideoTableRepository.deleteMissingFromRoot` | `VideoTableRepository.upsertScannedBatch` | 否 | 独立扫描水位；失败或取消时不执行缺失清理 |
