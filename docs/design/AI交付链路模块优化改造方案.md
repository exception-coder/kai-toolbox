# kai-toolbox「AI 交付链路」模块优化改造方案（交接版）

> 交接对象：接手本次优化改造的工程师。
> 本文档自包含：项目背景 → 现状诊断（带证据）→ 目标架构 → 分阶段执行计划 → 逐模块改造清单 → 硬性约束 → 验收标准 → 非目标 → 风险清单。
> 改造原则：**行为保持优先**。本方案全部为结构性重构（拆分、归位、类型化），不改变 API 契约、不改变数据 schema、不改变用户可见交互，除非在 Phase 6（可选增强）中另行约定。

---

## 1. 项目与本次范围

### 1.1 项目是什么

`kai-toolbox` 是本地单用户 AI 工具平台（Java 21 / Spring Boot 3.4 多模块 + Vite 6 / React 19 + SQLite + Node sidecar）。它不是普通工具集，而是一条 **AI 驱动、AI 自评估、AI 自交付** 的完整流水线：

```
reqpool(需求中枢)  →  prd-clarify(澄清/PRD/开发文档/工时/拆分/进度)  →  delivery-center(交付看板)
                          ↘  project-workspace(工作台) → claude-chat(Vibe Coding 执行) → 代码证据回流
                          ↘  eval(回归评测) ← harvest 人工裁决样本（含 fore-consult 的缺陷/咨询样本源）
```

### 1.2 本次改造范围

| 模块 | 前端 | 后端 | 角色 |
|---|---|---|---|
| PRD 澄清助手 | `frontend/src/features/prd-clarify/` | `tools/tool-prd-clarify/` | **改造重头** |
| AI 需求中枢 | `frontend/src/features/reqpool/` | `tools/tool-reqpool/` | 前端为主 |
| 项目工作台 | `frontend/src/features/project-workspace/` | 无独立后端 | 前端 |
| AI 交付中心 | `frontend/src/features/delivery-center/` | 复用 prd-clarify 端点 | 前端 |
| 回归评测 | `frontend/src/features/eval/` | `tools/tool-eval/` | 已较规整，小改 |
| 跨模块 handoff 协议 | 各 feature 间 sessionStorage/localStorage 字符串协议 | 无 | 类型化 |

**明确不在本次范围**：`claude-chat`（Vibe Coding，`useClaudeChatSocket.ts` 1620 行状态机）与 `fore-consult`（业务咨询）的改造——它们是底座与上游，建议本轮保持冻结，只在必要时做最小适配（见 §8）。

### 1.3 常用命令（供接手者快速上手）

```powershell
# 后端
mvn clean install                                         # 全量构建
mvn -pl toolbox-starter -am spring-boot:run               # dev 后端 :8080
mvn -pl tools/tool-prd-clarify -am test                   # 单模块测试

# 前端（frontend/ 下）
npm install
npm run dev                                               # Vite :5173 代理 /api
npm run typecheck                                         # tsc -b --noEmit，重构每步必跑
npm run build
```

运行数据：SQLite `${user.home}/.kai-toolbox/toolbox.db`。文档：`docs/design/architecture.md`（§6 明确排除调度/MQ/Redis/auth 等前置基础设施）、`CLAUDE.md`（提交约定）、`AGENTS.md`（架构约定）。

---

## 2. 现状诊断（带证据）

### 2.1 三个全局问题

1. **前端巨石文件、零测试**。核心页面全部是 500~5500 行单文件，且没有任何前端自动化测试。`prd-clarify` 的 5511 行页面里内联着十几个 300~600 行的独立组件。
2. **后端"上帝类"层内混装**。`PrdClarifyService` 2386 行同时管 6 件事（澄清/文档/工时/拆分/进度/修订）。分层骨架其实已存在（十几个协作者类），缺的是把内联实现归位。
3. **跨 feature 用裸字符串协议**。8+ 个 `sessionStorage`/`localStorage` key 在 feature 间传 JSON 字符串，无类型、无版本、无校验，拼错 key 静默失败。

**为什么"行为保持"的拆分对这个仓库尤其有价值**：本仓代码由 AI agent（feature-dev / Vibe Coding）持续维护，巨石文件超出 agent 上下文窗口后定位难、改错率高；拆成 300~500 行的模块能让 agent 一次读全、按目录约束改动范围。**重构不只是整洁，是降低 AI 协作的故障率。**

### 2.2 逐模块诊断表

| 模块 | 关键文件 | 行数 | 问题 | 严重度 |
|---|---|---|---|---|
| prd-clarify | `pages/PrdClarifyPage.tsx` | 5511 | 单文件四层混装：路由+状态+弹窗+纯函数；无测试 | 🔴 高 |
| prd-clarify | `service/PrdClarifyService.java` | 2386 | 上帝类，6 职责混装；有少量测试兜底 | 🔴 高 |
| prd-clarify | `api/PrdClarifyController.java` | 716 | 偏厚，含业务拼接逻辑 | 🟡 中 |
| prd-clarify | `delivery/DeliveryOverviewService.java` | 636 | 投影逻辑合理；正则解析进度报告是隐患 | 🟡 中 |
| reqpool | `pages/ReqPoolPage.tsx` | 2805 | 巨石；`factQuality.ts` 正则启发式评分 | 🔴 高（页面） |
| reqpool | `service/ReqAnalysisService.java` | 175 | 裸 runOnce 无超时/重试/JSON 容错 | 🟡 中 |
| reqpool | `api/ReqPoolController.java` | 452 | repository 直通前端，校验薄 | 🟡 中 |
| project-workspace | `pages/ProjectWorkspacePage.tsx` | ~1700 | 巨石；6 个 sessionStorage handoff key 裸字符串 | 🟡 中 |
| delivery-center | `components/DeliveryStageDialog.tsx` | 856 | 组件偏大；其余文件已较规整 | 🟢 低 |
| eval | `pages/EvalPage.tsx` / `service/EvalRunService.java` | 525 / 353 | 已分层良好；缺 PRD 生成质量评测集（能力缺口非结构问题） | 🟢 低 |

---

## 3. 目标架构

### 3.1 前端统一分层（所有 feature 套用同一模板）

```
features/<id>/
├── index.tsx                  # FeatureManifest（不动）
├── pages/<Id>Page.tsx         # 只做路由编排 + 面板切换，目标 <400 行
├── components/                # 全部内联组件拆出
│   ├── panels/                #  大型会话/流式面板（ChattingPanel 等）
│   ├── dialogs/               #  弹窗（DevDocUpdateDialog 等）
│   └── <Name>.tsx             #  普通组件
├── hooks/                     # 状态机/数据流 hooks（usePrdClarifySession 等）
├── lib/                       # 纯函数、协议、常量（handoff.ts 等）
├── api.ts / types.ts          # 已有，不动
└── styles/                    # 已有，不动
```

拆分规则：
- **组件拆出**：凡是已有独立 props 的内联组件（`function XxxPanel({...})` 形式）→ 直接搬到 `components/`，零行为变化，纯机械。
- **hooks 抽出**：`useState` 群 + 相关回调 → 抽成 hooks。**闭包依赖最多，逐次小步抽，每步 typecheck。**
- **纯函数下移**：`factQuality.ts` 式评分、`buildMenuSyncPrompt` 式提示词、`parseInsight` 式解析 → 移入 `lib/` 并补单测（纯函数最容易测，收益最高）。

### 3.2 后端编排器瘦身模式（PrdClarifyService 为样板）

```
PrdClarifyService（编排器，目标 <800 行）
├── 只做：状态流转编排、事务边界、SSE 生命周期、调协作者
├── 不做：prompt 构建 / JSON 解析 / 文件读写 / 版本扫描（全部下推）
└── 按职责拆出（已存在的直接归位，缺失的新建）：
    ├── PrdClarificationQuestionService（已有，收编澄清提问逻辑）
    ├── PrdDocumentGenerationService（已有，收编 PRD 生成）
    ├── PrdDocumentService（已完成，PRD 生成编排 + 版本备份 + 内容生命周期）
    ├── PrdSessionLifecycleService（已完成，会话创建 + 草稿转换 + 删除）
    ├── PrdDevDocumentService（已完成，TDD 生成 + 历史 + 文件版本）
    ├── PrdDevDocumentClarificationService（已完成，TDD 技术澄清 + 输出裁决）
    ├── PrdAnswerProcessingService（已有，收编回答处理）
    ├── PrdEffortEstimationService（已完成，工时评估 + JSON 修复；旧服务保留兼容委托）
    ├── PrdRequirementSplitService（已完成，需求拆分预览 + 子需求采纳；旧服务保留兼容委托）
    ├── PrdProgressEvaluationService（已完成，进度评估 + 版本；旧服务保留兼容委托）
    └── PrdDocRevisionService（已完成，后台修订 + 原地恢复；旧服务保留兼容委托）
```

每个拆出的 service 保留其依赖注入；控制器只依赖编排器，不直接依赖新 service（保持 API 契约不变）。

### 3.3 跨 feature handoff 协议类型化

新建 `frontend/src/lib/handoff.ts`（或 `frontend/src/features/_devkit/handoff.ts`，若不想放全局 lib），把现有 8+ 个 key 收敛为类型化 API：

```ts
// 现状：sessionStorage.setItem('kai-toolbox:claude-chat:prd-dev-launch', JSON.stringify({...}))
// 目标：
export const handoff = {
  writePrdDevLaunch: (v: PrdDevLaunch) => write('prd-dev-launch', v),
  readPrdDevLaunch: () => read<PrdDevLaunch>('prd-dev-launch'),
  // ...module-sync-launch / aggregation-draft / module-open-context / graphify-generate-launch / erp-dev-launch / knowledge-graph-bootstrap-launch / menu-sync-launch
}
```

要求：每个 payload 定义 TS 类型 + 运行时校验（`validate` 函数，解析失败返回 `null` 并 `console.warn`），写入/读取两侧全部改走 `handoff.*`，**禁止新增裸 key**。key 名保持向后兼容（不换字符串），迁移只改调用点。

---

## 4. 分阶段执行计划

> 每阶段独立提交、独立回滚（符合仓库"逐变更提交"约定）。阶段间可暂停，不影响已完成的收益。

| Phase | 内容 | 工作量 | 验收标准 |
|---|---|---|---|
| **P0 基线** | 全量 `npm run typecheck` + `mvn test` 记录基线绿；对每个待拆页面列出"关键路径手工验收清单"（见 §7.3） | 0.5 天 | 基线绿，验收清单就绪 |
| **P1 后端编排器瘦身** | `PrdClarifyService` 按 §3.2 拆分；`PrdClarifyController` 中的业务拼接下推 service | 2 天 | 现有测试全绿；新增拆出 service 的测试；接口契约零变化 |
| **P2 前端样板** | 拆 `delivery-center`（`DeliveryStageDialog` 856 行 → 子组件 + `lib/` 纯函数） | 1 天 | 页面行为不变；typecheck 绿；确立拆分规范 |
| **P3 prd-clarify 前端** | 组件搬移（先）→ hooks 抽取（后，小步）；`documentProfile.ts` 已有，`lib/` 补纯函数单测 | 3-5 天 | typecheck 绿；逐面板手工验收；每个拆出的纯函数有测试 |
| **P4 reqpool + project-workspace 前端** | 同 P3 方法拆两个页面；`factQuality.ts` 补单测；`buildMenuSyncPrompt` 移 `lib/` 补单测 | 3.5 天 | 同上 |
| **P5 协议类型化** | 按 §3.3 建 `handoff.ts`，迁移 8 个 key 的全部读写点 | 1 天 | grep 确认无裸 key 残留；写读两侧 smoke |
| **P6 eval 能力增强（可选）** | 新增 PRD 生成质量 adapter（非重构，补能力）；进度报告去正则化（§5.5） | 2-4 天 | 新 adapter 可跑通黄金集 |

**总计：结构重构约 12-15 个工作日；含 P6 增强约 14-19 个工作日。**

---

## 5. 逐模块改造清单

### 5.1 prd-clarify（重头，约 5-7 天）

**后端（P1，2 天）**
1. `PrdClarifyService.java`（2386 行）→ 编排器瘦身：
   - 工时评估块（同步/后台入口、Prompt、修订取源、状态维护、结果校验与 JSON 修复）已迁至 `PrdEffortEstimationService`；Prompt 契约集中在 `PrdEffortPrompts`，`PrdClarifyService` 的 3 个公开入口仅保留委托。
   - 需求拆分块已迁至 `PrdRequirementSplitService`：服务独立拥有 Prompt、确定性解析、知识上下文拼接和子草稿创建规则；`PrdClarifyService` 的公开入口仅保留兼容委托，Controller/API 契约不变。
   - 进度评估块（`evaluateProgress`/Prompt/证据门禁/内容读取/版本/备份/历史）已迁至 `PrdProgressEvaluationService`；`PrdClarifyService` 的 4 个公开入口仅保留委托。
   - 修订块已迁至 `PrdDocRevisionService`：服务独立负责修订节点复制、旧原地覆盖恢复、备份版本选择和根节点工时评估失效；`PrdClarifyService` 保留两个兼容委托，既有后台候选应用调用链不变。
   - 澄清提问与回答的已有协作者（`PrdClarificationQuestionService`/`PrdAnswerProcessingService`）若仍有内联重复逻辑，一并归位。
   - TDD 文档块已迁至 `PrdDevDocumentService`：服务独立负责生成编排、SSE 生命周期、问答草稿、历史记录、覆盖备份、当前/历史版本读取和手工保存；`PrdClarifyService` 的 5 个公开入口仅保留兼容委托，Controller/API 与后台候选应用链路不变。
   - TDD 技术澄清块已迁至 `PrdDevDocumentClarificationService`：服务独立负责渐进/批量 Prompt、PRD/TDD 与知识上下文拼接、Agent 流、SSE 断线策略、批量 JSON 校验和工作状态写入；`PrdClarifyService` 的 2 个公开入口仅保留兼容委托。
   - PRD 文档生命周期已迁至 `PrdDocumentService`：服务独立负责首次/增量生成编排、后台断线策略、兼容版本备份、产物账本落盘、路径访问、手工保存和内容读取；`PrdClarifyService` 的 5 个公开入口仅保留兼容委托，并降至 821 行。
   - PRD 会话生命周期已迁至 `PrdSessionLifecycleService`：服务独立负责正式会话创建、草稿保存与更新、`DRAFT -> CLARIFYING` 转换、父会话校验和删除顺序；`PrdClarifyService` 保留兼容委托及知识缓存清理，并降至 726 行，达到 `<800` 的门面目标。
2. `PrdClarifyController.java`（716 行）：仅保留参数校验 + 调 service；任何 20 行以上的业务拼接（如 `buildQuestionsJson` 调用链、`AnswerDistribution` 组装）下推。
3. 拆分顺序：先搬"纯私有方法组"（无跨状态依赖）→ 再搬"整段公开方法"→ 最后瘦编排器。每搬一组跑 `mvn -pl tools/tool-prd-clarify -am test`。

**前端（P3，3-5 天）**
1. 组件搬移（机械，先做）：从 `PrdClarifyPage.tsx` 拆出（均为已有独立函数，直接移动）：
   - `ChattingPanel`、`BatchClarifyPanel`、`EditingPanel`、`GeneratingPanel`、`RevisionPreparingPanel` → `components/panels/`
   - `StartClarifyDialog`、`EstimateEffortDialog`、`DevDocUpdateDialog`、`EvaluateProgressDialog`、`SplitReviewDialog`、`ReviseDialog`、`StartDevDialog`、`ClarifyHistorySheet`、`DevDocClarifyHistorySheet`、`DevDocHistorySheet`、`DevDocVersionViewDialog`、`ProgressHistorySheet`、`ProgressVersionViewDialog`、`EstimationDetailSheet`、`HistoryPanel`、`HistoryItem` → `components/dialogs/` 与 `components/`
   - 纯展示件（`StepBar`、`DocOutline`、`EstimationBadge`、`RawInputCard` 等）→ `components/`
   - 第一段已完成：`StepBar`、`DocOutline`、`EstimationBadge` 已原样迁入 `components/`，补 3 项组件表征测试；页面从 5838 行降至 5683 行。`RawInputCard` 因仍耦合需求字段规则与 Markdown 安全渲染，留待规则先下沉后再搬。
2. hooks 抽取（小心，后做，小步）：
   - `usePrdClarifySession`：会话状态（`session`/`step`/流式 `streamText`/`abortRef`）与 `askQuestion`/`submitAnswer`/`saveQaHistory` 回调。
   - `useDevDocState`：开发文档流式/草稿/版本/估算状态（`EditingPanel` 内约 200 行状态）。
   - `useEstimation`：估算状态与提交。
   - 每抽一个 hook：typecheck + 该面板手工过一遍主路径。
3. `lib/` 纯函数：`buildFinalRawInput`、`splitCatalogValues`、`formatLifecycleTime` 等移入 `lib/` 并补单测。
4. 顺序：**一次只拆一个面板**，拆完即提交；禁止一次性大 PR。

### 5.2 reqpool（P4，约 2 天）

1. `ReqPoolPage.tsx`（2805 行）按 §3.1 拆：
   - `RequirementLineage`/`RequirementLineageNode`/`PrdStageNode`/`TddStageNode`/`CodeStageNode`/`CodeAssessmentDetails`/`DeliveryTrack`/`MarkdownDocumentModal`/`RequirementDrawer`/`MobileRequirementCard`/`AssigneeCell`/`DeadlineEditor`/`AiStudio`/`LeaderBrief`/`FactQualityDetails`/`ScoreRing`/`PrdQuestionsModal` → `components/`
   - 状态与回调（5 个 `Set<string>` 运行态 + `questionPrd`/`previewPrd`/`tddWork`/`previewTdd` 等）→ `hooks/useReqpoolActions.ts`
2. `factQuality.ts`（163 行，正则评分）：**不改算法**（行为保持），移入 `lib/` 并补单测（当前零测试，纯函数最好测）。
3. 后端 `ReqAnalysisService.java`：**建议本轮仅加防御**（runOnce 包 try/catch + 明确错误信息），深度改造（超时/重试/幂等）列为后续独立任务，避免扩大本轮范围。`ReqPoolController` 若在拆分前端时发现缺失校验，补 `@Valid` 与状态机校验，不重构结构。

### 5.3 project-workspace（P4，约 1.5 天）

1. `ProjectWorkspacePage.tsx`（~1700 行）：
   - `buildMenuSyncPrompt`（170 行，受控 Agent 作业提示词）→ `lib/menuSyncPrompt.ts`，补单测（**重点**：这是"owner 确认关卡"红线提示词，测试防止误改）。
   - `buildModuleScopePrompt`/`buildLinkagePrompt`/`filterModuleTree` 等纯函数 → `lib/`
   - `AggregationCart`/`ProjectButton`/`ProjectTypeBadge`/`KnowledgeGraphFilterBar`/`ModuleSyncPanel`/`WorkspaceKnowledgeNotice`/`KnowledgeDirSetup`/`StateLine` → `components/`
   - 聚合篮状态（`useAggregationCart` 已有）保持。
2. **handoff key 迁移**（配合 P5）：`MODULE_OPEN_CONTEXT_KEY`/`MENU_SYNC_LAUNCH_KEY`/`AGGREGATION_DRAFT_KEY` 改走 `handoff.ts`。

### 5.4 delivery-center（P2，约 1 天）

1. `DeliveryStageDialog.tsx`（856 行）：按阶段拆子组件（PRD/TDD/Code/Test/Runtime 五块各有独立内容）；`DeliveryCanvas` 的大布局拆 `lib/` 几何/归一化纯函数（`normalizeDeliveryOverview` 已在 api.ts，保持）。
2. 其余文件（`DeliveryCenterPage` 263 行 / `PrdDraftDialog` 455 行 / `FeishuRequirementImportDialog` 290 行）已较规整，仅做必要的组件归位，不做大改。

### 5.5 eval（P6 可选，2-4 天；结构上本轮几乎不动）

1. 结构已良好，本轮**不改**。若要增强：
   - 新增 `PrdGenerationAdapter`（`EvalAdapter` SPI）：评估 PRD 生成质量（章节完整、业务字段覆盖、与澄清问答一致），数据集可从 prd-clarify 已 DONE 会话 harvest（人工确认过 PRD 的会话）。
   - **进度报告去正则化**（建议独立立项）：`ProgressReportParser` 正则解析 markdown → 改为 AI 直接输出结构化 JSON（进度项+证据），改提示词/解析/存储/前端渲染四端，并对存量报告做兼容读取。此改动动契约，需单独立项，不并入本轮重构。
2. `EvalRunService` 串行执行可后续加信号量并发（注释已预留）。

### 5.6 跨模块协议（P5，约 1 天）

见 §3.3。迁移清单（先 grep 确认全集）：
- `kai-toolbox:claude-chat:prd-dev-launch`（prd-clarify → claude-chat）
- `kai-toolbox:claude-chat:module-sync-launch`（project-workspace → claude-chat）
- `kai-toolbox:claude-chat:aggregation-draft`（project-workspace → claude-chat）
- `kai-toolbox:claude-chat:module-open-context`（project-workspace → claude-chat）
- `kai-toolbox:claude-chat:graphify-generate-launch` / `erp-dev-launch` / `knowledge-graph-bootstrap-launch`（各入口 → claude-chat）
- 相关 `localStorage` 偏好 key（`chat-mode:*`、`codex-options:*` 等）若本轮触碰，一并纳入类型化；不在触碰范围的可留待后续。

---

## 6. 硬性约束（必须遵守）

> 来源：`CLAUDE.md` / `AGENTS.md` / `docs/design/architecture.md`。违反以下任意一条视为不通过。

1. **行为保持**：不改变任何 REST/WS 契约；不改变数据库 schema；不改变用户可见文案与交互（除非 P6 明确立项）。
2. **无前置基础设施**：禁止引入 Redux/Zustand/消息总线/微前端/新构建工具。状态提升用 hooks + context，跨 feature 通信用 `handoff.ts`（仍是 storage 存储，只是类型化）。
3. **路由组件必须 `React.lazy`**：拆分时禁止把巨型面板直接静态 import 进 manifest 或 page 顶部导致初始包膨胀；保持现有懒加载边界。
4. **FeatureManifest 是前端菜单唯一事实源**：不改 `index.tsx` 的 manifest 结构；后端菜单 RBAC 不手动加。
5. **弹框/确认/提示一律用公共组件**：`@/components/ui/confirm-dialog` 的 `useConfirm`、`prompt-dialog`；**禁止原生 `alert`/`confirm`/`prompt`**（含 `window.prompt`）。
6. **不触碰 claude-chat / fore-consult 核心**：`useClaudeChatSocket.ts`、`ClaudeChatService.java`、sidecar `readonlyMcp.ts` 等本轮冻结。唯一允许的改动是 `handoff.ts` 迁移时读/写侧的调用点替换。
7. **SQL/schema 不动**：`SchemaInitializer` 每次启动重跑、`split(";")` 拆分，禁止在本轮增加任何 DDL。
8. **提交纪律**：每完成一个逻辑变更立即 `git commit` + `git push`；只 `git add <具体路径>`，**禁止 `git add -A` / `git add .`**；提交前 `git status` 核对不夹带无关文件；commit message 用 `type(scope): 标题` + 中文 body；**禁止任何 AI 署名**（不写 `Co-Authored-By` 等）。
9. **注释风格**：保留现有中文注释与"为什么"式注释风格；拆分时**保留原注释**（注释是设计资产），只在必要时补充"为何归位到此处"。
10. **每步验证**：前端任何改动后 `npm run typecheck`；后端任何改动后 `mvn -pl <module> -am test`；大文件拆分每拆完一个组件提交一次。

---

## 7. 测试与验收策略

### 7.1 后端

- 回归基线：`mvn test` 全绿（现状已有 `PrdDocChangeAnalysisServiceTest`、`PrdDocChangeAnalysisServiceTest`、`ConsultOrchestrationPipelineTest` 等）。
- 新增：每个拆出的 service 至少 1 个测试（工时评估、需求拆分和进度评估 focused service 均已覆盖核心分支与门面委托；`PrdDocRevisionService` 已覆盖修订复制、最新备份恢复、缺备份拒绝、恢复失败和门面委托）。
- 验收：拆分前后 `/api/prd-clarify/*` 的行为不变（用现有测试 + 手工冒烟）。

### 7.2 前端

- 当前无前端测试框架配置。**本轮不强制引入**（避免扩大范围），但：
  - `lib/` 纯函数（`factQuality`、`menuSyncPrompt`、`handoff`、`documentProfile`）建议引入 Vitest 补单测——纯函数无 DOM 依赖，成本最低收益最高。是否引入由接手专家定，若引入需一并配置 `npm run test` 脚本与 CI 口。
  - 状态机 hooks 的测试（如 `useReqpoolActions`）列为后续独立任务，不在本轮强制。
- 强制门槛：`npm run typecheck` 全绿；生产构建 `npm run build` 通过。

### 7.3 关键路径手工验收清单（拆分前后各跑一遍）

| 模块 | 验收路径 |
|---|---|
| prd-clarify | 新建草稿 → 开始澄清（progressive 逐题 + batch 一次性）→ 提交答案 → 生成 PRD（SSE 流式）→ 生成开发文档 → 工时评估 → 拆分 → 修订（版本不回退）→ 进度评估 |
| reqpool | 登记需求 → AI 分析 → 事实质量评分 → 关联 PRD → PRD/TDD/Code 阶段状态点随 prd-clarify 流转更新 |
| project-workspace | 选项目 → 模块树 → 打开会话（handoff 预填）→ 菜单识别 agent 拉起 → 聚合工作区创建 |
| delivery-center | 看板加载 → 阶段详情弹窗 → 飞书导入 → 起草需求跳转 prd-clarify |
| eval | 样本源 harvest → 发起评测 → 结果/混淆矩阵/基线 diff → Score 导出重试 |
| 协议 | 从 reqpool/prd-clarify/project-workspace 分别拉起 claude-chat 会话，确认 handoff 全部生效 |

---

## 8. 非目标（明确不做，防止范围蔓延）

- 不重写架构、不换技术栈、不做 UI 视觉改版。
- 不改 `claude-chat` / `fore-consult` / sidecar / `toolbox-llm` 核心。
- 不引入前端测试框架作为硬性要求（可选）；不引入状态管理库。
- 不改数据模型与 SQL；不做性能优化专项（拆分本身会顺带改善渲染，但不承诺）。
- 不做"进度报告去正则化"与"PRD 生成评测集"以外的能力增强（这两项在 P6 可选，且去正则化建议单独立项）。
- 不修 `ReqAnalysisService` 的深层次可靠性（超时/重试/幂等）——列为后续独立任务。

---

## 9. 风险与应对

| 风险 | 应对 |
|---|---|
| 前端巨石拆分时闭包/状态引用被搬错 | 组件搬移（纯机械）优先于 hooks 抽取；hooks 小步抽，每步 typecheck + 手工过主路径；拆一个提交一个 |
| `PrdClarifyService` 拆分破坏 SSE 流式时序 | 拆分只动"同步私有方法"与"无 SSE 依赖的公开方法"；SSE 生命周期留在编排器；每搬一组跑测试 |
| handoff key 迁移漏改读写一侧 | `handoff.ts` 统一 write/read + 校验；迁移后 grep 全仓确认 key 无残留；按 §7.3 协议验收清单逐条过 |
| 存量数据（旧版 PRD/进度报告格式）解析失败 | 进度报告不改格式（本轮）；如遇解析异常保留现有 warning 机制（`DeliveryOverviewService` 已有 warnings 收集） |
| 范围蔓延到 claude-chat/fore-consult | §6.6 冻结；改动手册写明"遇到底座问题只记录不修改，单独报 owner" |
| 提交纪律破坏（夹带无关文件） | §6.8 强制；接手专家遵循"只 add 本次改动路径" |

---

## 10. 工作量汇总

| 阶段 | 内容 | 工作量 |
|---|---|---|
| P0 | 基线 + 验收清单 | 0.5 天 |
| P1 | prd-clarify 后端拆分 | 2 天 |
| P2 | delivery-center 样板 | 1 天 |
| P3 | prd-clarify 前端拆分 | 3-5 天 |
| P4 | reqpool + project-workspace | 3.5 天 |
| P5 | handoff 协议类型化 | 1 天 |
| P6 | eval 增强（可选） | 2-4 天 |
| **合计** | 结构重构 | **约 12-15 个工作日** |
| | 含 P6 | 约 14-19 个工作日 |

**执行顺序建议**：P0 → P1 → P2 → P3 → P4 → P5，P6 视进度单独立项。任何阶段可暂停，已完成部分独立可交付、可回滚。
