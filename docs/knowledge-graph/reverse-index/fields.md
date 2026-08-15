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
