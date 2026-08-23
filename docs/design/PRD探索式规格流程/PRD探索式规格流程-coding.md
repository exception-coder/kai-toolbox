# PRD 探索式规格流程编码摘要

> 对应完整文档：`PRD探索式规格流程-current.md`。

## 变更记录

| 版本 | 日期 | 变更内容摘要 |
|---|---|---|
| v12 | 2026-08-23 | 规划评估升级为业务功能领导视图，统一人日口径并消除公共技术工作包重复累计 |
| v11 | 2026-08-22 | 初始化规格加入目标重构、复杂度审计和推荐方案，完成性准则升级为 `initial-spec-quality-v2` |
| v10 | 2026-08-22 | 规格到执行计划改为后台直接生成，旧 TDD 问题接口仅保留历史兼容 |
| v9 | 2026-08-22 | 探索改为可恢复后台任务，Vibe Coding 执行后按固定质量准则最多循环 3 次 |
| v8 | 2026-08-22 | 增加初始化规格确认后的需求中枢规划评估、标准准则与可评测运行记录 |
| v7 | 2026-08-22 | 用户可见文案统一为规格体系，内部 PRD 契约保持兼容 |
| v6 | 2026-08-22 | 需求入口改为 Discovery Canvas，弱化 PRD 库与前置配置 |
| v5 | 2026-08-22 | 增加模块知识优先检索、关键 DDL 上下文和少提问 Prompt 约束 |
| v4 | 2026-08-22 | 取消新会话回复式澄清，确认初始化规格后直接生成核心规格 |
| v3 | 2026-08-22 | 增加平台 OpenSpec 初始化检测、确认弹窗与自动续跑 |
| v2 | 2026-08-22 | 增加 OpenSpec 开发交接门禁与手工关联同步 |
| v1 | 2026-08-22 | 固化探索服务、状态机、初始化规格产物和前端页面落点 |

---

## 1. 核心业务规则

- 正式新会话必须先探索，禁止直接进入问题生成。
- `INITIAL_SPEC` 是可版本化中间产物，写入不得把会话标记为 `DONE`。
- 初始化规格是唯一业务澄清界面，用户直接编辑或保留 `OPEN-*`。
- 新会话不生成回复式澄清问题，确认初始化规格后直接进入核心规格生成。
- 探索必须先穷尽模块知识、Graphify、关键 DDL 和路由证据；开放问题通常为 0–3 个且最多 5 个。
- 探索必须先区分真实目标与用户提出的实现做法，再执行复杂度审计；重点检查重复流程、非必要状态、过度配置、提前泛化和可复用的现有能力。
- 初始化规格必须至少包含一个 `OPT-*` 候选方案和一个 `REC-*` 明确推荐；推荐默认选择最简单可验证方案，并说明收益、代价、风险和证据边界。
- `FACT-*`、`ASSUMPTION-*`、`OPT-*`、`REC-*` 与 `OPEN-*` 语义不得混用；AI 可以挑战实现方式，但不得替用户决定会改变业务结果的取舍。
- DDL 只作为结构事实，未命中时显式声明，不得输出推测表结构或整库 DDL。
- 最终核心规格必须接收初始化规格全文并保持稳定 ID。
- 旧会话不做数据迁移，继续识别旧状态。
- 关联 Vibe Coding 后必须先检测、必要时经用户确认初始化，再同步并校验 OpenSpec；失败时停在编码前。
- 输入页不再要求用户先整理标题、系统和模块；仅想法或附件即可开始探索，缺省标题由输入摘要生成。
- 页面不伪造清晰度百分比，也不恢复回复式澄清；待确定项继续由初始化规格统一承载。
- 用户可见术语固定为“规格探索 / 规格库 / 初始化规格 / 核心规格 / 执行计划”；路由、API、字段、事件、枚举和历史文件中的 `prd` / `PRD` 不重命名。
- 初始化规格确认后必须异步启动需求中枢规划评估；失败不阻断核心规格生成，但状态和错误必须可见、可重试。
- 规划评估固定使用 `initial-spec-planning-v3`，同一规格指纹和准则版本幂等；评估同时持久化项目/模块路由与四类证据源调用轨迹。
- 模型输出必须先校验；总工时、置信度缓冲和 6 小时人日换算由代码确定性计算。
- 领导视图不得展示两套工时结论；主单位为人日，小时与技术工作包只作为折叠评估依据。
- 规划评估 `v2` 限制单功能基础工时不超过 60 小时、总基础工时不超过 240 小时，共享成本只计算一次。
- 浏览器只登记和追踪探索运行，不承载 Agent 输出生命周期；刷新、离开页面或网络闪断不得取消后台执行。
- 探索调用 Vibe Coding 一次性执行会话，并保存执行会话 ID 与 trace ID；初始化规格未通过 `initial-spec-quality-v2` 时携带缺口继续完整重写，最多 3 次。
- 规格工作台、需求中枢和交付中心的新 TDD 入口直接调用执行计划生成；传入空问答历史并开启后台继续执行，不再调用技术问题生成接口。
- 执行计划 Prompt 必须把证据无法确认的关键技术决策写入“待确认技术事项”，不得把缺口转成前置问答。

---

## 2. 接口入口指针

| 接口 | 实现类 #方法 |
|---|---|
| `POST /api/prd-clarify/sessions/{id}/discover` | `PrdClarifyController#discover` |
| `GET /api/prd-clarify/sessions/{id}/discovery-run` | `PrdClarifyController#discoveryRun` |
| `GET /api/prd-clarify/sessions/{id}/initial-spec` | `PrdClarifyController#readInitialSpec` |
| `PUT /api/prd-clarify/sessions/{id}/initial-spec` | `PrdClarifyController#saveInitialSpec` |
| `POST /api/prd-clarify/sessions/{id}/initial-spec/confirm` | `PrdClarifyController#confirmInitialSpec` |
| `POST /api/claude-chat/openspec/status` | `OpenSpecProjectController#status` |
| `POST /api/claude-chat/openspec/initialize` | `OpenSpecProjectController#initialize` |
| `GET /api/reqpool/items/{id}/planning-assessment` | `ReqPoolController#planningAssessment` |
| `POST /api/reqpool/items/{id}/planning-assessment/retry` | `ReqPoolController#retryPlanningAssessment` |

---

## 3. 涉及类清单

| 全路径 | 操作 | 说明 |
|---|---|---|
| `com.exceptioncoder.toolbox.prdclarify.service.PrdDiscoveryService` | 新增 | 聚合证据并通过 Vibe Coding 生成初始化规格。 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdDiscoveryTaskService` | 新增 | 持久化后台运行、恢复执行并控制三次完成性循环。 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdInitialSpecValidator` | 新增 | 用版本化确定性准则裁决初始化规格是否完整。 |
| `com.exceptioncoder.toolbox.prdclarify.repository.PrdDiscoveryRunRepository` | 新增 | 保存运行阶段、尝试次数、执行会话、trace 和校验结果。 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdDdlContextService` | 新增 | 按需求及图谱命中筛选项目 DDL 基线。 |
| `com.exceptioncoder.toolbox.prdclarify.service.DomainKnowledgeQueryService` | 修改 | 模块优先检索，无命中时降级为项目级检索。 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdRouteContextService` | 新增 | 从编码画像路由表提取 URL 入口证据。 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdClarifyService` | 修改 | 代理探索、读取、保存和确认动作。 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdClarificationQuestionService` | 兼容 | 仅服务历史 `CLARIFYING` 会话。 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdDocumentGenerationService` | 修改 | Prompt 接收初始化规格并保留 ID。 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdArtifactService` | 修改 | 支持 `INITIAL_SPEC` 投影。 |
| `com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository` | 修改 | 新状态与路径持久化。 |
| `com.exceptioncoder.toolbox.prdclarify.api.PrdClarifyController` | 修改 | 新增四个接口。 |
| `com.exceptioncoder.toolbox.prdclarify.spi.InitialSpecPlanningGateway` | 新增 | 规格确认后的跨模块稳定请求边界。 |
| `com.exceptioncoder.toolbox.reqpool.service.ReqPlanningAssessmentService` | 新增 | 规划评估 focused service。 |
| `com.exceptioncoder.toolbox.reqpool.repository.ReqPlanningAssessmentRepository` | 新增 | 评估运行持久化与幂等查询。 |
| `com.exceptioncoder.toolbox.integration.InitialSpecPlanningIntegration` | 新增 | 使用 Spring 任务执行器连接两个工具模块。 |

前端交接指针：

```text
openSpecHandoff.ts — 统一 OpenSpec 门禁与手工关联同步 Prompt
StartDevDialog.tsx / StartDevelopmentDialog.tsx — 新会话首条消息携带门禁
PrdLinkPanel.tsx → ChatPage.tsx — 手工关联后发送或排队同步任务
OpenSpecInitializationDialog.tsx — 未初始化时展示目录、命令、确认、失败与重试
OpenSpecProjectService.java → OpenSpecCliGateway.java — 校验项目边界并执行受控 CLI
InputPanel.tsx — Discovery Canvas、轻量 Persona、可选上下文和附件输入
StepBar.tsx — “想法 / 探索 / 成型”安静导航
HistoryPanel.tsx — 桌面端默认折叠的辅助资料库
```

### 关键方法签名与职责

```text
PrdDiscoveryTaskService#schedule(String): PrdDiscoveryRun — 幂等登记并异步执行探索
PrdDiscoveryService#prepare(String): DiscoveryContext — 查询业务知识、Graphify、DDL 和路由证据
PrdDiscoveryService#generate(DiscoveryContext, int, String, List<String>): DiscoveryAttempt — 拉起一次 Vibe Coding 执行或 ReAct 修复
PrdInitialSpecValidator#validate(String): ValidationResult — 按固定章节、方案标识、内容有效性和开放问题上限检查完整性
PrdDiscoveryService#read(String): String — 读取当前初始化规格
PrdDiscoveryService#save(String, String): void — 保存用户编辑后的新版本
PrdDiscoveryService#confirm(String): PrdSession — 将 SPEC_REVIEW 推进到 GENERATING
PrdDdlContextService#query(String, String, String, String): String — 返回有限的相关 DDL 证据
PrdRouteContextService#query(String, String): String — 按项目和原始需求中的 URL 查询路由证据
InitialSpecPlanningGateway#schedule(InitialSpecPlanningRequest): void — 快速登记异步规划任务
ReqPlanningAssessmentService#start(InitialSpecPlanningRequest): ReqPlanningAssessment — 幂等绑定并登记运行
ReqPlanningAssessmentService#retry(String): ReqPlanningAssessment — 对当前确认规格显式重试
```

---

## 4. 数据结构

```text
表名：prd_session
新增字段：initial_spec_path TEXT

表名：prd_discovery_run
状态：RUNNING | COMPLETED | FAILED
阶段：QUEUED | COLLECTING_EVIDENCE | VIBE_EXECUTING | VALIDATING | PUBLISHING | COMPLETED | FAILED
完成性准则：initial-spec-quality-v2
单会话只允许一条 RUNNING 记录

产物类型：INITIAL_SPEC
兼容文件名：{sessionId}-initial-spec.md
不可变路径：.artifacts/{sessionId}/initial_spec/v{version}.md

表名：req_pool_planning_assessment
幂等键：prd_session_id + input_hash + criteria_version
状态：RUNNING | COMPLETED | FAILED
准则版本：initial-spec-planning-v3
```

前端状态：

```text
PrdSessionStatus = DRAFT | DISCOVERING | SPEC_REVIEW | CLARIFYING(历史兼容) | GENERATING | DONE | ERROR
PrdStep = INPUT | DISCOVERING | SPEC_REVIEW | CHATTING(历史兼容) | GENERATING | EDITING
```

TDD 兼容状态 `BUILDING_QUESTIONS`、`AWAITING_ANSWERS` 只用于读取历史数据；新入口只写入 `GENERATING | ERROR | DONE`。

---

## 5. 重要约束与边界

- `PrdDiscoveryService` 负责用例编排；Graphify、业务知识、DDL 和路由服务只负责各自证据来源。
- `PrdDdlContextService` 只读项目知识库，不依赖 `tool-claude-chat` 的会话或 SQL 登记能力。
- 单个证据源失败不终止探索；单轮模型失败或结果不完整会进入下一轮，三次均失败才把会话置为 `ERROR`。
- 后台运行必须先持久化再提交执行器；应用启动时恢复未终结运行，浏览器连接不参与取消语义。
- 初始化规格内容只从平台生成路径读取，不接受任意文件路径。
- 新增服务不得继续扩张现有 `PrdClarifyService`，后者只保留兼容门面代理。
- OpenSpec 同步必须给出 change id、产物路径和 validate 结果。
- 没有 root 时由平台弹窗取得用户授权；后端只能在已登记工作区或当前会话主目录执行初始化。
- 初始化命令固定为 `openspec init . --tools <tool>`，`tool` 仅允许 `claude` 或 `codex`；成功后自动续跑暂存的同步任务。
- OpenSpec CLI 输出和执行时间必须有上限，工具缺失、超时和非零退出码都要返回可恢复错误。
- `ReqPlanningAssessmentService` 不复用价值洞察的 `estimatedHours`，规划评估独立落库、独立过期。
- 六类工作包固定为 `DISCOVERY_DESIGN`、`BACKEND`、`FRONTEND`、`DATA`、`INTEGRATION`、`TEST_VERIFICATION`。
- 置信度缓冲固定为 `HIGH=10%`、`MEDIUM=25%`、`LOW=40%`；每人日固定按 6 个 AI 有效工作小时换算。
- 模型不得输出总工时作为权威值；服务端对所有拆分项重新求和并应用缓冲。

---

## 6. 下游依赖调用

```text
GraphifyQueryService#query(String, String, String): String
DomainKnowledgeQueryService#query(String, String): String
DomainKnowledgeQueryService#query(String, String, String): String
PrdDdlContextService#query(String, String, String, String): String
PrdRouteContextService#query(String, String): String
AgentOneShotRunner#runObserved(ExecutionRequest, List<ImageInput>): ObservedResult
PrdArtifactService#write(String, PrdArtifactType, String, ArtifactMetadata): PrdArtifact
```

---

## 7. 异常处理要点

- 图谱、知识库、DDL 或路由不存在 → 返回空证据并在初始化规格中声明，不抛业务错误。
- 模块知识无命中 → 自动降级到项目级检索；DDL 无相关片段 → 只返回基线存在但未命中的声明。
- 会话不存在 → `IllegalArgumentException`，Controller 转换为 `404`。
- 非 `SPEC_REVIEW` 状态确认 → `IllegalStateException`，返回冲突错误。
- Agent 失败或完成性校验未通过 → 带服务端缺口继续下一轮；达到 3 次后运行标记 `FAILED`、会话标记 `ERROR`，允许重新登记探索。
- OpenSpec 未初始化 → 返回 `NOT_INITIALIZED`，前端弹出确认，不发送编码任务。
- OpenSpec 初始化失败 → 弹窗保留目录和错误信息，允许重试或取消；取消后不发送暂存任务。

---

## 8. 规格准入评估编码摘要

```text
frontend/src/features/reqpool/factQuality.ts
  evaluateRequirementFacts(...) -> FactQualityResult
    - score / grade / maturityLabel：规格成熟度，不参与单一门禁
    - level：READY | ASSUMPTIONS | DECISION
    - blockers：只记录阻断完整实施的关键决策
    - riskFlags：按 NEW_MODULE / BUG_FIX / MODULE_ADJUST 输出实施中核查项

frontend/src/features/reqpool/components/ReqPoolSections.tsx
  FactQualityDetails(...)：先展示准入状态，再展示成熟度与类型化风险

frontend/src/features/reqpool/pages/ReqPoolPage.tsx
  风险列：优先展示 blockers；无 blocker 时展示 riskFlags，不再按 score < 75 判定风险
```

约束：

- 不改变 ReqPool 后端或数据库契约，历史记录即时按新确定性规则重算。
- 补充证据权重固定为 5，不允许 URL、截图或日志作为所有需求的统一硬门禁。
- 新增阻断条件必须描述会改变实现方向的关键事实，不得把“字段未填满”直接升级为阻断。
- 规则变更必须同步 `factQuality.test.ts`，至少覆盖完整规格、低信息规格、新模块带假设启动和 BUG 缺少复现材料四类路径。
