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

---

## 9. 重试需求规划评估

`POST /api/reqpool/items/{id}/planning-assessment/retry`

- 使用该需求已绑定规格会话的当前初始化规格重新执行。
- 相同输入与准则版本已完成时幂等返回已有结果；失败运行允许重新发起并保留历史。
- 返回最新运行，耗时模型调用在后台执行。
