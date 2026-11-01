# Forge 业务咨询后端分析 API v1

适用：`yoooni-agent` 的 IT 客服伙伴，及管理员明确授权的其他应用。SDK 版本 `@kai/forge-consult-client@0.2.0`，Node.js 22+；任何后端语言也可按 HTTP 合同调用。机器合同见 [OpenAPI](openapi-backend.yaml)。

面向接入方的执行顺序、环境回执和双方验收见 [完整交接](HANDOFF-YOOONI-AGENT.md)；本文件仍是接口字段与行为的权威正文。

**交付状态：源码与脱敏示例已实现；尚未重启加载、签发实际应用凭据或完成真实模型及跨系统验收。** 没有已验证的测试 Base URL。本机后端配置端口为 18080，不能作为其他项目组可访问地址或已上线证明。管理员须确认实际测试 HTTPS 域名、加载版本和路由可用，再安全交付 `FORGE_BASE_URL`。以下响应是合同示例，不是真实运行回执。

## 能力、分工与限制

固定能力标识 `agentId=it-support-partner`，配置入口为管理员 API `/api/fore-consult/backend-clients`。不是可由应用选择任意源码目录、模型、账号或原生 AI 线程的通用接口。

```text
yoooni-agent：飞书消息入库 → DeepSeek 判断 → 建问题并保存 requestId / 完整输入
    → Forge：应用认证 → 持久化分析任务 → 无工具模型分析 → 校验结果与证据
    → yoooni-agent：DeepSeek 整理三个同结论、不同表达或处理路径的回复候选
    → 保存候选、分析任务/结果来源、人工选择及修改 → 人工确认后发送飞书
```

Forge 不发送飞书消息，不修改业务数据。目标引擎复用 `AgentOneShotRunner`，默认模型和账号来自现有业务咨询 `/api/fore-consult/model-policy`，每个任务实际执行前读取并记录配置版本，运行期间固定。

每个任务独立分析，`conversationId` 是调用方关联标识，**不自动接续完整聊天或复用他人的原生线程**。传入必要近期上下文即可。首版依据来自：调用方描述、错误文字、附件提取文字，以及显式提供的获准源码引用；没有自主全库检索、数据库查询、Web 登录、图片二进制上传或回调。没有独立源码证据时结果明确提示缺口，不能宣称已核验现场或数据库。

## 管理员申请与安全交付

1. 管理员通过现有 Forge 登录取得自己的管理员 Token；应用无需该 Token，更不需要管理员密码。部署设置 `FORGE_CONSULT_BACKEND_ENABLED=true`，保持 `toolbox.auth.enabled=true`；后端加载须按项目规则单独确认重启。
2. 管理员从现有 ProjectCatalog 确定可授权的稳定项目 ID。`ERP/SRM/PLM` 等名称不能直接当作授权 ID。`projectIds: []` 可只分析调用方资料。
3. 管理员 `POST /api/fore-consult/backend-clients`，使用 `Authorization: Bearer <管理员Token>`，JSON 示例：

   ```json
   {"appId":"yoooni-agent","tenantId":"company-test","projectIds":[],"expiresAt":1800000000000}
   ```

   `expiresAt` 是毫秒时间戳，必须在未来且不超过一年；示例日期需要按实际申请时间替换。返回 `clientId/clientSecret/appId/tenantId/expiresAt/version`；256 位随机 `clientSecret` 只在本次响应提供，数据库只保存摘要。响应 `Cache-Control: no-store`。保存管理员申请单和 clientId，凭据走密码管理器或现有 Secret 管理，不发到群、飞书正文、源码或日志。
4. 应用后端配置 `FORGE_BASE_URL`、`FORGE_CLIENT_ID`、`FORGE_CLIENT_SECRET`、`FORGE_TENANT_ID`；密钥由 Secret 管理注入，不需凭据文件。身份与中台目录服务的凭据不同。
5. 轮换：管理员 `POST /api/fore-consult/backend-clients/{clientId}/rotate`，仅返回一次新 secret；可附 JSON `{"expiresAt":新的毫秒时间戳}` 续期未撤销的授权（包括已到期授权，仍限未来一年以内），不改变企业或项目范围。旧 secret 和旧短期票据立即失效；更新应用 Secret，SDK 调用 `resetAuthentication()` 后重新换票。原任务仍属于相同 clientId。撤销使用 `POST .../{clientId}/revoke`，不可用旧凭据重新启用；重新授权需另建凭据。

Base URL 须为站点根，例如 `https://forge-test.example.com`（占位，非真实地址）。反向代理必须使用 TLS 并保留 Authorization。此 HTTP 后端调用不需要浏览器 CORS/WSS 配置。宿主默认 JWT whitelist 已精确包含 `/api/fore-consult/v1/token`、`/api/fore-consult/v1/analysis-tasks` 及其子路由；这些接口始终独立验证应用凭据，不是匿名开放。部署如覆盖 whitelist 或给整个咨询路径配置 ADMIN-only，须精确恢复专用路由的应用认证，不得放开其余接口。

## 认证

`POST /api/fore-consult/v1/token`，`Content-Type: application/x-www-form-urlencoded`，表单 `grant_type=client_credentials`，头 `Authorization: Basic base64(clientId:clientSecret)`。不要把凭据放 URL。

```json
{"access_token":"fct_<43位随机值>","token_type":"Bearer","expires_in":900,"scope":"consult:analyze consult:read consult:cancel"}
```

最长有效 900 秒，且不晚于应用凭据到期，无 Refresh Token。之后业务请求只用 `Authorization: Bearer <access_token>`，不再发送 secret。票据每次使用都核验到期、凭据版本和撤销状态；它不具备平台用户、开发会话或其他工具权限。原用户 WSS Token 不能用于本 API。

## HTTP 合同

| 方法与路径 | 成功响应 | 含义 |
|---|---|---|
| `POST /api/fore-consult/v1/analysis-tasks` | 202，Task | 登记或复用原任务，`Location` 给查询路径，`Retry-After: 2` |
| `GET /api/fore-consult/v1/analysis-tasks/{taskId}` | 200，Task | 查询当前状态和已校验结果 |
| `GET /api/fore-consult/v1/analysis-tasks?requestId=...` | 200，Task | 提交超时后用原 requestId 恢复；不列举其他任务 |
| `POST /api/fore-consult/v1/analysis-tasks/{taskId}/cancel` | 202，Task | 请求取消；仅 CANCELLED/TIMED_OUT 等终态表示该任务执行已返回 |

首版不提供回调；使用 GET 轮询，建议 2–3 秒一次。终态不是一律成功。`SUCCEEDED/NEEDS_INFORMATION` 携带 `result`；`FAILED/CANCELLED/TIMED_OUT/INTERRUPTED` 没有成功分析。`CANCEL_REQUESTED` 不能当作已停止。

Task 公共字段：`taskId/requestId/problemId/conversationId/status/result/error/createdAt/startedAt/finishedAt/policyVersion`。时间为毫秒时间戳；尚未开始/结束/选择配置时对应字段为 null。错误为 `code/message/retryable`；接口错误另含脱敏 `traceId`。

### 请求结构

JSON 不接受未知字段。请求体最多 192KiB，解析后最多 100000 字符。项目与企业授权在执行前再次核验。

| 字段 | 必填、类型与限制 |
|---|---|
| `agentId` | 必填，固定 `it-support-partner` |
| `tenantId` | 必填，与服务凭据绑定企业完全一致 |
| `problemId/conversationId` | 必填，业务问题和会话关联，各 1–100 位字母数字及 `_.:-` |
| `requestId` | 必填，8–100 位字母数字及 `_ -`；发送前持久化 |
| `title` | 必填，非空，最多 200 字符 |
| `description` | 必填，非空，最多 12000 字符 |
| `recentContext` | 可选，最多 10 条，每条非空、最多 2000 字符 |
| `classification` | 可选 `{decision,reason}`，decision 为 `IT/NOT_IT/UNKNOWN`，reason 非空、最多 2000 字符；仅作为待核实输入 |
| `systemIds` | 可选，最多 8 个不重复、已授权且可用的 ProjectCatalog 稳定 ID；单 ID 同 tenantId 格式 |
| `errorText` | 可选，最多 12000 字符 |
| `attachmentTexts` | 可选，最多 5 项 `{id,name,text}`；id 同 problemId 格式，名称最多 200、提取文字最多 12000，均非空；是调用方提供的文字，不等于 Forge 读取过原附件 |
| `evidenceRefs` | 可选，最多 8 项 `{projectId,path,startLine,endLine}`；项目须在 systemIds；相对路径最多 300 字符，UTF-8 非敏感源码/文档，每段最多 120 行/8000 字符，文件最多 500KiB；全部证据最多 80000 字符 |

源码引用只支持 `.java/.ts/.tsx/.js/.jsx/.vue/.md/.txt/.sql`。拒绝隐藏目录、配置/凭据目录和敏感文件名，不接受 `..`、绝对路径、外部 URL 或越界软链接。GBK 文件请由应用提取文字，不能声称已自动正确解码。整个模型任务禁用工具，不请求用户密码、数据库凭据或模型密钥。

### 完整脱敏请求

```json
{
  "agentId":"it-support-partner",
  "tenantId":"company-test",
  "problemId":"IT-20261101-001",
  "conversationId":"feishu-thread-001",
  "requestId":"it-20261101-001-analysis-1",
  "title":"标签打印没有反应",
  "description":"用户反馈点击标签打印后没有反应，暂未确认其他用户是否受影响。",
  "recentContext":["用户表示昨天可以正常打印，尚未提供浏览器报错。"],
  "classification":{"decision":"IT","reason":"业务系统打印功能异常"},
  "systemIds":[],
  "errorText":"",
  "attachmentTexts":[{"id":"image-001","name":"打印页面截图","text":"页面中可见标签打印按钮，截图没有显示报错弹窗。"}],
  "evidenceRefs":[]
}
```

登记响应示例：

```json
{"taskId":"3b61e656-0941-4392-9d97-9f6becb08972","requestId":"it-20261101-001-analysis-1","problemId":"IT-20261101-001","conversationId":"feishu-thread-001","status":"QUEUED","result":null,"error":null,"createdAt":1793536000000,"startedAt":null,"finishedAt":null,"policyVersion":null}
```

查询返回分析成功但需补信息的示例（`NEEDS_INFORMATION`）；当证据足以给出建议且 missingInformation 为空时为 `SUCCEEDED`，并不意味着建议已经执行：

```json
{
  "taskId":"3b61e656-0941-4392-9d97-9f6becb08972",
  "requestId":"it-20261101-001-analysis-1",
  "problemId":"IT-20261101-001","conversationId":"feishu-thread-001",
  "status":"NEEDS_INFORMATION",
  "result":{
    "schemaVersion":"1.0","understanding":"用户报告标签打印无反应，需要先核实影响范围和现场报错。",
    "category":"PRINTING",
    "facts":[{"text":"调用方报告点击标签打印没有反应。","evidenceIds":["input"]}],
    "possibleCauses":[{"description":"可能是打印组件或浏览器环境问题，尚未核实。","confidence":"POSSIBLE","evidenceIds":[]}],
    "recommendations":["先确认其他同事是否也无法打印，并记录点击后的提示。"],
    "missingInformation":["同一电脑其他页面能否打印？"],
    "unknowns":["尚未确认运行环境。"],
    "evidenceLimitations":"未独立核验系统源码、运行环境或数据库；调用方资料不代表系统事实已确认。",
    "humanHandoff":{"recommended":true,"reason":"需 IT 同事核实现场环境。"},
    "evidence":[
      {"id":"input","kind":"CALLER_DESCRIPTION","source":"IT-20261101-001","text":"标签打印没有反应\n用户反馈点击标签打印后没有反应，暂未确认其他用户是否受影响。\n调用方近期上下文：\n用户表示昨天可以正常打印，尚未提供浏览器报错。\n调用方分类：IT；理由：业务系统打印功能异常"},
      {"id":"attachment-1","kind":"CALLER_ATTACHMENT_TEXT","source":"image-001","text":"页面中可见标签打印按钮，截图没有显示报错弹窗。"}
    ],
    "replyCandidatesGeneratedBy":"CALLER"
  },
  "error":null,"createdAt":1793536000000,"startedAt":1793536001000,"finishedAt":1793536010000,"policyVersion":4
}
```

结果的分类枚举：`ACCESS/PRINTING/DATA/WORKFLOW/INTEGRATION/OTHER/UNKNOWN`。facts、possibleCauses、recommendations、missingInformation、unknowns 均最多 8 项；文字单项最多 2000 字符。事实须引用非空 evidenceIds；`SUPPORTED` 原因同样须引用有效 ID，`POSSIBLE` 可无引用。服务端注入 evidence 和 evidenceLimitations（实际证据覆盖边界），不接受模型编造引用，也不删除模型给出的未知项；这项结构校验不能替代人工对因果结论的复核。

### 错误与恢复

| 状态／错误码 | 动作 |
|---|---|
| 400 `INVALID_REQUEST` | 修正字段、长度或不支持的执行配置；不盲重试 |
| 401 `INVALID_CLIENT_TOKEN` | 检查应用凭据、有效期与轮换；不改用管理员 Token |
| 403 `TENANT_NOT_ALLOWED/PROJECT_NOT_ALLOWED` | 核对已批准范围，不自动扩大 |
| 404 `TASK_NOT_FOUND` | 不存在或不属于该 clientId；不泄漏其他企业任务 |
| 409 `IDEMPOTENCY_CONFLICT` | 同键内容不一致；查原任务，不覆盖原问题 |
| 413 `PAYLOAD_TOO_LARGE` | 缩小输入 |
| 429 `RATE_LIMITED/TASK_LIMITED` | 遵循 Retry-After；保留原键与输入 |
| 503 `INTEGRATION_DISABLED` | 管理员确认部署和开关 |
| 任务 FAILED `INVALID_ANALYSIS_OUTPUT` | 原问题保留；没有合格结果，不伪造候选 |
| 任务 TIMED_OUT `ANALYSIS_TIMEOUT` | 该次执行超时；人工或应用规则显式创建新 requestId 重试并关联原任务 |
| 任务 INTERRUPTED `EXECUTION_INTERRUPTED` | 服务重启期间中断，未自动重放 |

认证失败响应（脱敏示例）：

```json
{"code":"INVALID_CLIENT_TOKEN","message":"应用凭据或票据无效、已过期或已撤销","retryable":false,"traceId":"ee2f89c4-845e-40d5-a8b1-8834b8f089f2"}
```

超时终态中的 error 示例：

```json
{"code":"ANALYSIS_TIMEOUT","message":"分析超时，问题已保留；重试须使用新 requestId","retryable":true}
```

HTTP 超时与任务执行超时不同：网络断开时先 `GET ?requestId=原键`；也可显式以**原键和完全相同内容**重试登记。SDK 不自动重发问题。接口 `retryable=true` 不授权改变幂等键自动重复执行。首次 GET 未发现原任务仍可能与未完成提交竞争，保留同键重试即可。

认证全局最多 120 次/分钟，业务接口每 clientId 最多 120 次/分钟；单 clientId 最多 8 个未完成任务，全局最多 64 个、同时运行最多 2 个。默认执行上限 180 秒，可由管理员设置 `FORGE_CONSULT_BACKEND_TIMEOUT_MS`（1000–600000）。SDK HTTP 超时默认 15 秒，只限制一次 HTTP 请求，不会取消任务。

取消排队任务直接 CANCELLED；运行任务先 CANCEL_REQUESTED，执行器返回后才置 CANCELLED/TIMED_OUT。若引擎不能确认退出，保留取消中状态且不释放并发名额。服务启动将原 RUNNING/CANCEL_REQUESTED 标为 INTERRUPTED，QUEUED 可继续；一期仅支持单个 Forge 实例，不支持多实例共库消费。

## 调用与联调

安装 `kai-forge-consult-client-0.2.0.tgz` 后运行 [backend.mjs](examples/backend.mjs)。环境变量由本应用 Secret 管理及已持久化问题提供；`IT_REQUEST_ID` 不要每次进程重启随机生成。示例不会发送飞书消息。

```js
import { ForgeConsultBackendClient } from '@kai/forge-consult-client/backend';
const forge = new ForgeConsultBackendClient({
  baseUrl: process.env.FORGE_BASE_URL,
  clientId: process.env.FORGE_CLIENT_ID,
  getClientSecret: () => process.env.FORGE_CLIENT_SECRET,
});
// input 使用上文完整请求；先保存在本应用数据库再提交。
const receipt = await forge.submit(input);
const task = await forge.get(receipt.taskId);
```

联调须验证：真实测试问题完成认证、指定能力、分析与依据、三个候选、人工编辑保存与重开读取来源；重复请求只建一个任务；不同应用/企业不能查询或取消；失败保留问题与草稿；未经人工确认不发飞书。Forge 测试不能代替 yoooni-agent 的候选来源、选择记录和发送队列验收。

## 实现定位与资料维护

Forge 代码：`tools/tool-fore-consult/.../backend/`；SDK：`src/backend.ts`。首次启用由自动 schema 创建 `consult_service_client/consult_service_token/consult_analysis_task`。**DDL 未核验**：三张新表未命中既有 DDL 基线，字段来自本次 schema，不宣称已核验运行库；无需手工执行 SQL。既有用户 SDK 的附件/会话 ID 与本 API 的任务 ID 不互换。

参考：[OAuth Client Credentials](https://www.rfc-editor.org/rfc/rfc6749#section-4.4)、[HTTP 202](https://www.rfc-editor.org/rfc/rfc9110#section-15.3.3)、[OWASP 企业隔离](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)。源码测试与部署、实际模型、跨应用流程分别记录在 Forge 仓库的 `openspec/changes/consult-backend-analysis/tasks.md`（仓库维护记录，不是安装包内文件）。
