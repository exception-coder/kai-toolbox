# PRD 探索式规格流程 API 契约

## 1. 启动探索

`POST /api/prd-clarify/sessions/{id}/discover`

- 响应：`202 application/json`，立即返回持久化的后台探索运行，不等待证据查询或 Agent 完成。
- 幂等：同一会话已有 `RUNNING` 运行时返回该运行，不重复拉起 Vibe Coding 执行。
- 副作用：状态更新为 `DISCOVERING`；后台通过 Vibe Coding 执行会话生成规格，服务端校验不完整时最多继续 3 次；通过后写入 `INITIAL_SPEC` 并更新为 `SPEC_REVIEW`。

```json
{
  "id": "run-id",
  "status": "RUNNING",
  "stage": "QUEUED",
  "progress": 5,
  "attempt": 0,
  "maxAttempts": 3,
  "criteriaVersion": "initial-spec-quality-v2"
}
```

### 查询探索进度

`GET /api/prd-clarify/sessions/{id}/discovery-run`

- 无运行：`204`。
- 有运行：返回最近一次运行；前端在 `RUNNING` 时轮询，页面关闭不影响后台任务。
- 阶段：`QUEUED | COLLECTING_EVIDENCE | VIBE_EXECUTING | VALIDATING | PUBLISHING | COMPLETED | FAILED`。
- 可观测字段：尝试次数、标准版本、Prompt 版本、Vibe Coding 执行会话 ID、trace ID、完成性缺口、错误和时间戳。
- `evidenceTrace` 使用 `planning-evidence-trace-v2`，包含项目关系、项目角色、实际查询目标、调用状态、查询原因和残余缺口。

### 项目证据范围

`GET /api/claude-chat/project-evidence/scope?project={project}`

- 必须先于任何证据查询调用。
- 返回平台校验后的 `scopeId`、主项目和关联项目；路径不可由客户端自行覆盖。
- 关系为 `PRIMARY | REFACTORS | MIGRATES_FROM | DEPENDS_ON | INTEGRATES_WITH`。

### 项目关系配置

`PUT /api/claude-chat/project-dependencies?primaryPath={path}`

```json
{
  "dependencies": [
    {
      "projectPath": "D:/yoooni/yoooniCodeSpace/yoooni",
      "projectKey": "yoooni",
      "relation": "REFACTORS"
    }
  ]
}
```

- 兼容旧请求 `{ "paths": [...] }`，旧请求按 `DEPENDS_ON` 保存。
- `projectKey` 为空时由平台从受控工作区项目推导，客户端不能提交工作区外路径。

---

## 2. 读取初始化规格

`GET /api/prd-clarify/sessions/{id}/initial-spec`

- 成功：`200 text/plain`，返回当前初始化规格 Markdown。
- 尚未生成：`404`。

---

## 3. 保存初始化规格

`PUT /api/prd-clarify/sessions/{id}/initial-spec`

```json
{
  "content": "# 初始化规格"
}
```

- 成功：`204`。
- 约束：仅允许 `SPEC_REVIEW` 状态保存；每次保存生成新的 `INITIAL_SPEC` 产物版本。

---

## 4. 确认初始化规格

`POST /api/prd-clarify/sessions/{id}/initial-spec/confirm`

- 成功：返回最新 `PrdSessionView`，状态为 `GENERATING`。
- 非法状态：`409`。
- 后续：前端立即建立核心规格生成 SSE；后端异步向需求中枢提交规划评估；初始化规格中的未决 `OPEN-*` 原样保留，不再生成回复式业务澄清问题。

---

## 5. 会话视图变化

`PrdSessionView` 新增：

```json
{
  "initialSpecPath": "C:/Users/.../.kai-toolbox/prd/{id}-initial-spec.md",
  "status": "SPEC_REVIEW"
}
```

新增状态：`DISCOVERING`、`SPEC_REVIEW`。已有字段保持兼容。

---

## 6. 检测 OpenSpec 项目状态

`POST /api/claude-chat/openspec/status`

```json
{
  "path": "D:/work/project",
  "sessionId": "optional-session-id",
  "tool": "codex"
}
```

- `path` 必须是已登记工作区目录，或与 `sessionId` 对应会话主目录一致。
- 返回状态：`READY`、`NOT_INITIALIZED`、`TOOL_UNAVAILABLE`、`ERROR`。
- 只执行 `openspec context --json`，不修改项目。

---

## 7. 初始化 OpenSpec 项目

`POST /api/claude-chat/openspec/initialize`

请求体与状态检测一致，`tool` 只允许 `claude` 或 `codex`。

- 已初始化时幂等返回 `READY`。
- 未初始化时执行 `openspec init . --tools <tool>`，再用 `openspec context --json` 复核。
- 工具缺失、执行超时或初始化后仍无 root 时返回可读失败状态；前端不得发送暂存编码任务。

---

## 8. 查询需求规划评估

`GET /api/reqpool/items/{id}/planning-assessment`

- 无运行：`204`。
- 有运行：返回最近一次与当前确认规格关联的规划评估。
- `status` 为 `RUNNING | COMPLETED | FAILED`。
- 完成结果包含 `criteriaVersion`、`promptVersion`、`inputHash`、领域功能拆分、工作包区间、规划总工时、人日、置信度和评估依据。
- `payloadJson.firstTestRelease` 表示首版上测试环境的最小可验证闭环。客户端必须兼容历史结果无该字段；新版字段结构如下，小时与工作日由服务端从 `capabilityIds` 确定性汇总：

```json
{
  "scope": "业务人员可在测试环境完成单笔新品进度查询闭环",
  "capabilityIds": ["CAP-001"],
  "acceptanceChecks": ["按款可查看当前里程碑并回查来源"],
  "deferredScope": ["批量导出", "预测预警"],
  "confidence": "MEDIUM",
  "hoursMin": 18,
  "hoursMax": 30,
  "workingDaysMin": 3.0,
  "workingDaysMax": 5.0
}
```

---

## 9. 重试需求规划评估

`POST /api/reqpool/items/{id}/planning-assessment/retry`

- 使用该需求已绑定规格会话的当前初始化规格重新执行。
- 相同输入与准则版本已完成时幂等返回已有结果；失败运行允许重新发起并保留历史。
- 返回最新运行，耗时模型调用在后台执行。

---

## 10. 更新需求价值判定并联动规划

`POST /api/reqpool/items/{id}/analyze`

- 请求显式携带 `engine`；无值时继承最近一次价值判定引擎，无历史时默认 Codex。
- 响应：`202 application/json`，只完成持久化登记，不等待模型；返回最新需求视图，`insightRun.status` 为 `RUNNING`。
- 同一需求已有 `RUNNING` 判定时幂等返回原运行，不重复调用模型；判定完成或失败后允许用户再次登记新运行。
- 后台先进入 `DISCOVERING`，主动刷新业务知识、Graphify、DDL 和路由调用轨迹；能力暂不可用时才复用最近规划的历史轨迹。
- 前端在 `insightRun.status=RUNNING` 时轮询需求视图；刷新、关闭页面或网络中断不取消任务，应用重启后恢复未完成运行。
- 后台判定完成并保存洞察后，如需求存在初始化规格规划历史，则登记引用本次判定的新规划运行。
- 关联规划同样在后台执行，响应中的 `planningAssessment.status` 可为 `RUNNING`。
- 新规划记录返回 `sourceInsightId`、`sourceInsightHash`，用于说明正式工时复用了哪次价值判定；历史记录允许为空。
- 价值判定失败时不创建规划运行，并保留上一次价值判定与规划结果。

`ReqItemView.insightRun`：

```json
{
  "id": "run-id",
  "status": "RUNNING",
  "stage": "DISCOVERING",
  "engine": "codex",
  "errorMessage": null,
  "startedAt": 1787480000000,
  "completedAt": null
}
```
