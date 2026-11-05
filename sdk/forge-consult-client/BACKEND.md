# Forge 业务咨询后端分析 API v1

## 当前默认合同（1.5.0 / SDK 0.4.0）

认证方式不变：既有 clientId/clientSecret 换票，tenantId 继续使用原授权企业，无需重新颁发或员工登录。新请求省略 replyMode 即 FORGE_FLEX，也可显式填写；结果 schemaVersion=1.2。

- `businessInstructions`：可选字符串，最多 8000 字符，只描述本次业务输出规则及 businessResult 的期望形状；不能授予工具、身份或资源权限。
- `businessContext`：可选非 null JSON，序列化最多 16000 字符。人工经验、适用系统和条件以 `business-context` / `CALLER_BUSINESS_CONTEXT` 证据进入同次分析，不冒充截图或独立核验事实。
- `result.replyCandidates`：0–8 条，仍为 `{id,text,evidenceIds}`，每条最多 4000 字符、真实非空引用、稳定 `reply-N`。不按固定方向凑数；没有可靠回复时为空，`humanHandoff.recommended=true` 并说明阻塞。
- `result.businessResult`：1.2 必有，按调用方规则生成的 JSON 对象或 null，序列化最多 16000 字符。Forge 不硬编码 ITCS 逻辑，也不验证任意调用方 Schema；接入方校验其必要字段。

```json
{"agentId":"it-support-partner","tenantId":"yoooni","problemId":"IT-3619","conversationId":"IT-3619","requestId":"warehouse-3619-001","title":"新建仓库找不到供应商","description":"ERP 截图显示仓库3619关联厂商为空。","replyMode":"FORGE_FLEX","businessInstructions":"用一句话给出适用的操作建议，businessResult 返回 action 字段。","businessContext":{"system":"ERP","condition":"当前仓库关联厂商为空","manualExperience":"添加对应供应商资料，再建立仓库与供应商关联"}}
```

旧任务、旧请求号和原结果不改写；已有号重试先恢复原任务。改变规则、资料、图片或模式仍为 409，应保存新请求号。显式 `FORGE` 保留 1.1/三条，显式 `CALLER` 保留旧结果。下文三条示例专指显式旧 FORGE 合同，推荐使用上面的新版。上传、隔离、恢复、取消与人工确认发送规则不变。

源码实现和模型替身测试不等于目标站点已加载。部署与真实任务结果须单独回执。

适用：`yoooni-agent` 的 IT 客服伙伴，及管理员明确授权的其他应用。SDK 版本 `@kai/forge-consult-client@0.4.0`，Node.js 22+；任何后端语言也可按 HTTP 合同调用。机器合同见 [OpenAPI](openapi-backend.yaml)。

面向接入方的执行顺序、环境回执和双方验收见 [完整交接](HANDOFF-YOOONI-AGENT.md)；本文件仍是接口字段与行为的权威正文。

**交付状态：源码与脱敏示例已实现；尚未重启加载、签发实际应用凭据或完成真实模型及跨系统验收。** 没有已验证的测试 Base URL。本机后端配置端口为 18080，不能作为其他项目组可访问地址或已上线证明。管理员须确认实际测试 HTTPS 域名、加载版本和路由可用，再安全交付 `FORGE_BASE_URL`。以下响应是合同示例，不是真实运行回执。

## 能力、分工与限制

固定能力标识 `agentId=it-support-partner`，配置入口为管理员 API `/api/fore-consult/backend-clients`。不是可由应用选择任意源码目录、模型、账号或原生 AI 线程的通用接口。

```text
yoooni-agent：飞书消息入库 → DeepSeek 判断 → 建问题并保存 requestId / 完整输入
    → Forge：应用认证 → 上传原图 → 持久化分析任务 → 多模态分析及实际有用的回复候选 → 校验结果与证据
    → yoooni-agent：保存候选（replyMode=FORGE_FLEX），不做 OCR、不用模板补齐
    → 保存候选、分析任务/结果来源、人工选择及修改 → 人工确认后发送飞书
```

Forge 不发送飞书消息，不修改业务数据。目标引擎复用 `AgentOneShotRunner`，默认模型和账号来自现有业务咨询 `/api/fore-consult/model-policy`，每个任务实际执行前读取并记录配置版本，运行期间固定。

每个任务独立分析，`conversationId` 是调用方关联标识，**不自动接续完整聊天或复用他人的原生线程**。传入必要近期上下文即可。依据来自：调用方描述、错误文字、附件提取文字、应用身份上传的原图，以及显式提供的获准源码引用；没有自主全库检索、数据库查询、Web 登录或回调。没有独立源码证据时结果明确提示缺口，不能宣称已核验现场或数据库。

## 管理员申请与安全交付

### 可视化管理

管理员打开 **业务咨询 → 配置 → 外部应用接入 → 管理应用接入凭据**，或直接访问本实例 `/tools/fore-consult/access`。同事本地运行 Forge 时，在其本地实例开通，不连接另一位开发者的电脑，也不共用其他实例的凭据。

页面支持搜索应用/企业/clientId，查看授权范围、状态、到期和最近变更，颁发、轮换/续期及撤销。颁发或轮换后，密钥仅当次显示，可复制/下载包含四个 `FORGE_*` 变量的服务端私有配置；请按接入方实际可访问地址填写 Base URL。遗失密钥需显式轮换，列表不能找回明文。页面颁发使用 UUID `Idempotency-Key` 并保留非敏感草稿及请求标识，刷新后相同申请不重复颁发；已完成的键返回 `409 CREDENTIAL_ALREADY_ISSUED`，应查看现有记录并按需轮换。此请求头为可选扩展，原 API 仍允许为同一应用/企业显式颁发多组独立凭据。

授权管理可在分析开关关闭时先行准备，仍要求现有管理员身份和平台认证开启。分析换票/执行继续受 `FORGE_CONSULT_BACKEND_ENABLED` 控制，页面不写部署开关、不自动重启服务。需要改变项目或企业范围时，撤销后重新颁发；新 clientId 不继承旧任务。首次开通和后续轮换仍可沿用下述 API。

1. 管理员通过现有 Forge 登录取得自己的管理员 Token；应用无需该 Token，更不需要管理员密码。部署设置 `FORGE_CONSULT_BACKEND_ENABLED=true`，保持 `toolbox.auth.enabled=true`；后端加载须按项目规则单独确认重启。
2. 管理员从现有 ProjectCatalog 确定可授权的稳定项目 ID。`ERP/SRM/PLM` 等名称不能直接当作授权 ID。`projectIds: []` 可只分析调用方资料。
3. 管理员 `POST /api/fore-consult/backend-clients`，使用 `Authorization: Bearer <管理员Token>`，JSON 示例：

   ```json
   {"appId":"yoooni-agent","tenantId":"company-test","projectIds":[],"expiresAt":1800000000000}
   ```

   `expiresAt` 是毫秒时间戳，必须在未来且不超过一年；示例日期需要按实际申请时间替换。返回 `clientId/clientSecret/appId/tenantId/expiresAt/version`；256 位随机 `clientSecret` 只在本次响应提供，数据库只保存摘要。响应 `Cache-Control: no-store`。保存管理员申请单和 clientId，凭据走密码管理器或现有 Secret 管理，不发到群、飞书正文、源码或日志。
4. 应用后端配置 `FORGE_BASE_URL`、`FORGE_CLIENT_ID`、`FORGE_CLIENT_SECRET`、`FORGE_TENANT_ID`；密钥由 Secret 管理注入，不需凭据文件。身份与中台目录服务的凭据不同。
5. 轮换：管理员 `POST /api/fore-consult/backend-clients/{clientId}/rotate`，仅返回一次新 secret；可附 JSON `{"expiresAt":新的毫秒时间戳}` 续期未撤销的授权（包括已到期授权，仍限未来一年以内），不改变企业或项目范围。旧 secret 和旧短期票据立即失效；更新应用 Secret，SDK 调用 `resetAuthentication()` 后重新换票。原任务仍属于相同 clientId。撤销使用 `POST .../{clientId}/revoke`，不可用旧凭据重新启用；重新授权需另建凭据。

Base URL 须为站点根，例如 `https://forge-test.example.com`（占位，非真实地址）。反向代理必须使用 TLS 并保留 Authorization。此 HTTP 后端调用不需要浏览器 CORS/WSS 配置。宿主默认 JWT whitelist 已精确包含 `/api/fore-consult/v1/token`、`/api/fore-consult/v1/analysis-tasks` 及其子路由，以及 `/api/fore-consult/v1/attachments` 及子路由；这些接口始终独立验证应用凭据，不是匿名开放。部署如覆盖 whitelist 或给整个咨询路径配置 ADMIN-only，须精确恢复专用路由的应用认证，不得放开其余接口。

管理员元数据接口：`GET /api/fore-consult/backend-clients?q=...`，返回 `{enabled,clients,projects,truncated}`，最多 200 条并支持按应用、企业或 clientId 搜索（最多 100 字符）。clients 只含 clientId、appId、tenantId、projectIds、version、status（ACTIVE/EXPIRED/REVOKED）、expiresAt、changedBy、changedAt；projects 为可授权的 `{id,name}`，不返回路径。无 secret、摘要或票据。响应 no-store，普通用户和应用票据均拒绝，最近变更不是完整审计历史。管理与分析开关分别反映实际启动配置，页面入口准备不代表已部署或真实模型联调完成。

## 认证

`POST /api/fore-consult/v1/token`，`Content-Type: application/x-www-form-urlencoded`，表单 `grant_type=client_credentials`，头 `Authorization: Basic base64(clientId:clientSecret)`。不要把凭据放 URL。

```json
{"access_token":"fct_<43位随机值>","token_type":"Bearer","expires_in":900,"scope":"consult:analyze consult:read consult:cancel consult:attachments"}
```

最长有效 900 秒，且不晚于应用凭据到期，无 Refresh Token。之后业务请求只用 `Authorization: Bearer <access_token>`，不再发送 secret。票据每次使用都核验到期、凭据版本和撤销状态；它不具备平台用户、开发会话或其他工具权限。原用户 WSS Token 不能用于本 API。

## HTTP 合同

| 方法与路径 | 成功响应 | 含义 |
|---|---|---|
| `POST /api/fore-consult/v1/attachments?uploadId=...` | 200，Image | 原图字节上传或幂等复用 |
| `GET /api/fore-consult/v1/attachments?uploadId=...` | 200，Image | 未知上传结果恢复 |
| `GET /api/fore-consult/v1/attachments/{attachmentId}` | 200，Image | 当前凭据的图片元数据，不下载字节 |
| `POST /api/fore-consult/v1/analysis-tasks` | 202，Task | 登记或复用原任务，`Location` 给查询路径，`Retry-After: 2` |
| `GET /api/fore-consult/v1/analysis-tasks/{taskId}` | 200，Task | 查询当前状态和已校验结果 |
| `GET /api/fore-consult/v1/analysis-tasks?requestId=...` | 200，Task | 提交超时后用原 requestId 恢复；不列举其他任务 |
| `POST /api/fore-consult/v1/analysis-tasks/{taskId}/cancel` | 202，Task | 请求取消；仅 CANCELLED/TIMED_OUT 等终态表示该任务执行已返回 |

首版不提供回调；使用 GET 轮询，建议 2–3 秒一次。终态不是一律成功。`SUCCEEDED/NEEDS_INFORMATION` 携带 `result`；`FAILED/CANCELLED/TIMED_OUT/INTERRUPTED` 没有成功分析。`CANCEL_REQUESTED` 不能当作已停止。

图片任务另含持久化 `attachmentIds`，失败时也保留引用。Task 公共字段：`taskId/requestId/problemId/conversationId/status/result/error/createdAt/startedAt/finishedAt/policyVersion`。时间为毫秒时间戳；尚未开始/结束/选择配置时对应字段为 null。错误为 `code/message/retryable`；接口错误另含脱敏 `traceId`。

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
| `attachmentIds` | 可选，最多 5 个不重复的不透明上传图片 ID，合计 20MiB；不能混用员工 SDK 附件 ID |
| `replyMode` | 可选 `CALLER/FORGE`；省略为旧 CALLER 行为，FORGE 要求直接返回恰好三条候选 |
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

## 原图输入与三条候选（API 合同 1.1.0 / SDK 0.4.0）

URL 仍为 `/api/fore-consult/v1`。纯文字旧请求不改字段，仍返回 `schemaVersion=1.0`、`replyCandidatesGeneratedBy=CALLER`，也不添加模板候选。需要原图时增加 `attachmentIds`；新任务默认 `replyMode: "FORGE_FLEX"`，结果版本为 `1.2`，按需返回 0–8 条回复。旧任务原样保留，显式 CALLER/FORGE 继续可用；旧版服务端不支持新字段，会明确 400，接入方须加载匹配版本，不能删除图片后静默重试。

### 上传与恢复

`POST /api/fore-consult/v1/attachments?uploadId=<已持久化上传键>`，应用 Bearer，Content-Type 为 `image/png` 或 `image/jpeg`，body 为原始字节，**不是 multipart/JSON/base64 字符串**。`uploadId` 与 requestId 格式相同，8–100 位字母数字、短横线或下划线；它独立于分析 requestId。返回 200、no-store、Location 与 Image：

```json
{"attachmentId":"img_11111111-1111-4111-8111-111111111111","uploadId":"it-image-001","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mediaType":"image/png","size":12345,"width":1280,"height":720,"createdAt":1793600000000,"expiresAt":1793686400000}
```

单张 1 字节至 5MiB，边长最多 10000、总像素最多 2000 万；最多 5 张、合计 20MiB/任务。首版仅支持静态 PNG/JPEG，JDK ImageIO 校验格式、尺寸和解码，拒绝损坏/类型伪装/动画 PNG，不支持 WebP/GIF/SVG/PDF/视频；请在上传前导出静态 PNG/JPEG，而非先 OCR。图片不会发布公开 URL，不访问调用方磁盘、不需要飞书 Secret。元数据响应没有图片字节和内部路径。

归属是可信 clientId 及其不可变企业，不能用请求字段改归属。同 clientId+uploadId、同原字节 SHA-256 和 MIME 返回原 ID；改字节或 MIME 为 409 `UPLOAD_IDEMPOTENCY_CONFLICT`。上传超时先 `GET /attachments?uploadId=原键`；404 仍可能与原上传竞争，只能原键原字节重试，SDK 不自动重发。换票和轮换保持 clientId，不影响归属；重新签发的新 clientId 不继承。

原图从上传起有效 24 小时，重复上传不延长；到期 GET/新任务准入返回 410 `ATTACHMENT_EXPIRED`，排队时到期则任务 FAILED 同码。后台每分钟将过期 BLOB 置空；元数据留 30 天用于同键冲突/失效识别后删除，超过窗口不能复用旧 uploadId。已完成任务和结果不依赖图片存活，可继续按原 requestId 查询。运行前已读入内存的图片允许该轮完成。单凭据有效图片最多 25MiB、实例共 100MiB，保留元数据最多 2000/凭据、10000/实例，超额 429 `IMAGE_QUOTA_EXCEEDED`。SQLite 的字节擦除是逻辑清理，不承诺底层文件立即缩小或物理安全擦除。

跨 clientId/企业查元数据或任务引用都为 404 `ATTACHMENT_NOT_FOUND`。任务摘要包含原图 ID 顺序、文字和 replyMode；任何更改均 409 `IDEMPOTENCY_CONFLICT`。原图 ID 对应内容不可修改。附件文字字段仍兼容，但不是读取原图的证据。

### 原图执行边界

复用平台业务默认 Codex 模型及账号。运行前根据该账号的 `models_cache.json` 精确模型 `input_modalities` 是否含 `image` 检查；缓存缺失、元数据未知或不支持时任务 FAILED `IMAGE_MODEL_UNSUPPORTED`。需要管理员在本实例核对模型目录、账号和支持图片的模型，不能按模型名字假定支持。

原始字节通过受管多模态接口交给现有 Sidecar/SDK，Codex 使用 `local_image`；没有 OCR 替代或文件名代替图像。模型必须逐图给出 `imageObservations`；无法读取为 FAILED `IMAGE_NOT_READABLE`，回执缺失/重复/伪造为 `INVALID_ANALYSIS_OUTPUT`，不公布完整成功。图太小、旋转、模糊及模型本身能力会影响准确性；传图和回执不保证每个像素判断正确。结果 `imageInputs` 是服务端注入的实际输入元数据，`evidence` 新类型 `CALLER_IMAGE` 使用真实 attachmentId。原图文字不授予工具或改变指令。

### FORGE 候选合同与脱敏调用

```js
const original = await forge.uploadImage(savedUploadId, originalImageBytes, 'image/png');
// 先将附件 ID 与完整问题输入保存，再提交。提交未知时用同 requestId 查回。
const receipt = await forge.submit({
  agentId: 'it-support-partner', tenantId: process.env.FORGE_TENANT_ID,
  problemId: 'IT-001', conversationId: 'thread-001', requestId: savedAnalysisRequestId,
  title: '标签打印异常', description: '点击打印没有反应，原图中可见当前页面。',
  attachmentIds: [original.attachmentId], replyMode: 'FORGE_FLEX',
});
const current = await forge.get(receipt.taskId); // 若仍在执行，按正常间隔继续查询
```

完整可运行 [backend.mjs](examples/backend.mjs) 默认启用 FORGE_FLEX；可选 `IT_IMAGE_PATH` 仅由接入方本地读取，另需已持久化 `IT_UPLOAD_ID` 和 `IT_IMAGE_TYPE=image/png`（或 image/jpeg）。示例没有数据库持久化实现，不可替代接入方先保存请求的职责。

完整脱敏的上传元数据、任务请求与图文终态响应见 [backend-image-task.json](examples/backend-image-task.json)。它是合同示例，不是真实 taskId 或模型验收记录；须使用本实例实际上传的附件 ID。

FORGE 模式在原结构化分析旁增加：

```json
{
  "schemaVersion":"1.1",
  "replyCandidatesGeneratedBy":"FORGE",
  "replyCandidates":[
    {"id":"reply-1","text":"已看到您反馈的打印问题。请先确认其他同事是否也有相同情况，便于判断影响范围。","evidenceIds":["input"]},
    {"id":"reply-2","text":"目前还不能确定打印失败的原因，建议先查看页面有没有报错，再一起排查。","evidenceIds":["input"]},
    {"id":"reply-3","text":"为了继续判断，请补充点击打印后的提示，或者发一张清晰的报错截图。","evidenceIds":["input"]}
  ]
}
```

上例是结果扩展字段示例，完整 result 仍包含 understanding/category/facts/possibleCauses/recommendations/missingInformation/unknowns/humanHandoff/evidence/evidenceLimitations。原图任务另含 `imageInputs: [Image]` 和 `imageObservations: [{attachmentId,readable:true,observation}]`。

显式旧 FORGE 模式的候选恰好三条，正文非空且最多 4000 字符，依据为真实 evidence ID；服务端按生成顺序赋稳定 `reply-1/2/3` 并保存结果，重复查询不会重新生成。三条共用事实、不互相矛盾，信息不足给追问，不把建议说成已修复。装配项目说人话 Skill 和输出约束，检查可识别 SQL/凭据/路径/日志；结构和模式检查无法独立证明语义完全正确，仍需人工选择、修改并确认。候选不合格整次 FAILED，不退成 CALLER、不补模板。yoooni-agent 保存 candidateId、原候选及依据、人工修改、任务来源；不再调用 DeepSeek 为本次 FORGE 结果二次生成三条。DeepSeek 的前置 IT 分类仍可保留。Forge 从不调用飞书发送或业务修改。

新增错误：404 ATTACHMENT_NOT_FOUND、409 UPLOAD_IDEMPOTENCY_CONFLICT、410 ATTACHMENT_EXPIRED、413 IMAGE_TOO_LARGE/IMAGES_TOO_LARGE/IMAGE_DIMENSIONS_EXCEEDED、415 IMAGE_FORMAT_UNSUPPORTED、422 IMAGE_NOT_READABLE、429 IMAGE_QUOTA_EXCEEDED。任务执行后的图片错误体现在任务 error，同步上传/准入错误使用 HTTP；已有任务失败须显式新 requestId 重试，上传失败另按 uploadId 恢复，不能混淆。

## 调用与联调

安装 `kai-forge-consult-client-0.4.0.tgz` 后运行 [backend.mjs](examples/backend.mjs)。环境变量由本应用 Secret 管理及已持久化问题提供；`IT_REQUEST_ID` 不要每次进程重启随机生成。示例不会发送飞书消息。

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

联调须验证：真实测试问题完成认证、指定能力、分析与依据、有效候选、人工编辑保存与重开读取来源；重复请求只建一个任务；不同应用/企业不能查询或取消；失败保留问题与草稿；未经人工确认不发飞书。Forge 测试不能代替 yoooni-agent 的候选来源、选择记录和发送队列验收。

## 实现定位与资料维护

Forge 代码：`tools/tool-fore-consult/.../backend/`；SDK：`src/backend.ts`。首次启用由自动 schema 创建应用、票据、任务及 `consult_analysis_attachment` 原图表。**DDL 未核验**：本次原图及既有应用/任务表未命中 DDL 知识基线，字段来自仓库 schema，不宣称已核验运行库；无需手工执行 SQL。既有用户 SDK 的附件/会话 ID 与本 API 的任务 ID 不互换。

参考：[OAuth Client Credentials](https://www.rfc-editor.org/rfc/rfc6749#section-4.4)、[HTTP 202](https://www.rfc-editor.org/rfc/rfc9110#section-15.3.3)、[OWASP 企业隔离](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)。源码测试与部署、实际模型、跨应用流程分别记录在 Forge 仓库的 `openspec/changes/consult-backend-analysis/tasks.md`及 `openspec/changes/consult-backend-images/tasks.md`（仓库维护记录，不是安装包内文件）。
