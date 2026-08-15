# Delivery 结构化证据 API 契约

## 1. 新增验证运行

`POST /api/prd-clarify/delivery-overview/{sessionId}/verification-runs`

```json
{
  "commandId": "maven-test"
}
```

返回 HTTP 202：

```json
{
  "id": "uuid",
  "commandId": "maven-test",
  "gitHead": "40-char-sha",
  "status": "RUNNING",
  "exitCode": null,
  "testCount": null,
  "outputSummary": null,
  "startedAt": 0,
  "finishedAt": null,
  "stale": false
}
```

请求不允许 executable、args、cwd 字段；Jackson 未知字段不作为命令来源，服务端永远只从 `commandId` 白名单取 argv。

---

## 2. 概览响应的 additive 字段

`GET /api/prd-clarify/delivery-overview`

`RequirementView` 新增：

| 字段 | 类型 | 说明 |
|---|---|---|
| `overallProgress` | number | 服务端权威 10/10/60/20 结果 |
| `overallProgressVariants` | object | 服务端计算的纳入/排除测试两套总进度 |
| `evidenceMode` | string | `VERIFIED_LEDGER/LEGACY_UNVERIFIED/UNASSESSED` |
| `verifiedClaimCount` | number | 具有已验证证据的 claim 数 |
| `invalidEvidenceCount` | number | 路径/行号/文件校验失败数 |
| `verification` | object/null | 最新验证运行投影 |
| `availableVerificationCommands` | array | 服务端可用 `commandId/label` |

旧字段 `coverage/codeScoreVariants/progressItems/stages` 保留一个兼容周期。

---

## 3. 状态与错误

| 场景 | HTTP/状态 | 说明 |
|---|---|---|
| commandId 空或不在白名单 | 400 | 不创建 run |
| session 不存在/无权 | 400 | 验证入口不泄露会话可见性细节 |
| 项目根无法解析 | 400 | 不创建 run |
| 同 session 已有 RUNNING | 409 | 防止重复构建 |
| 进程启动或超时 | run=`ERROR` | 已创建运行可审计 |
| exitCode 非 0 | run=`FAILED` | 失败不贡献 verification 20 分 |
| Git HEAD 已变化 | `stale=true` | 原 status 保留，不贡献分数 |
