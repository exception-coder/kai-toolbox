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
