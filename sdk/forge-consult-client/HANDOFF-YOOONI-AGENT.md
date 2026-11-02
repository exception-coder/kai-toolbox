# yoooni-agent「IT 客服伙伴」接入交接

交付方：Forge 业务咨询平台。接入方：`yoooni-agent` 项目组及其开发 AI。日期：2026-11-01。实现提交：`5cd15729c`；API `v1`；SDK `@kai/forge-consult-client@0.2.0`，Node.js 22+。

**现在可以按本文开发客户端；尚不能宣布测试环境已开放或真实联调通过。** 新接口默认关闭，本次没有重启服务、签发真实凭据或修改 yoooni-agent 工程。Forge 管理员完成下述环境交付后，接入方才能进行真实调用。

## 一、交付物与可用范围

本文负责双方执行交接。字段、状态、错误和安全约束的唯一接口正文是 [BACKEND.md](BACKEND.md)，机器合同是 [openapi-backend.yaml](openapi-backend.yaml)，可运行 Node 示例是 [examples/backend.mjs](examples/backend.mjs)。请将这些文件与 SDK tarball 一起转交，避免只转发本机绝对路径。

| 项目 | 本次交付 |
|---|---|
| 指定能力 | `agentId: it-support-partner`，固定后端分析能力 |
| 调用方式 | HTTPS 异步任务，提交、轮询查询、按 requestId 恢复、取消；首版无回调 |
| 身份 | 独立应用 clientId/clientSecret 换短期 Bearer 票据，不使用员工登录 Token 或 MCP |
| 输入 | 问题、必要近期上下文、DeepSeek 分类、报错、附件提取文字、获准源码引用 |
| 输出 | 问题理解、分类、事实、可能原因、建议、缺失信息、未知项、依据、转人工建议 |
| 三条候选 | **由 yoooni-agent 调用 DeepSeek 整理**，Forge 返回结构化分析和来源 |
| 业务操作 | Forge 不发送飞书，不修改业务数据；发送仍由接入方人工确认 |
| 原有使用 | 业务咨询页面和原用户 WSS 入口保持兼容；两种合同、凭据、ID 不混用 |
| 当前状态 | 源码、SDK 和定向自动化验证已完成；测试地址、启用、凭据和真实联调待完成 |

本接口复用现有业务咨询默认模型/账号策略，任务实际执行前读取配置，执行期间固定。能力入口在 `tools/tool-fore-consult/.../backend/`，默认模型管理沿用 `/api/fore-consult/model-policy`，应用授权入口为 `/api/fore-consult/backend-clients`。

**能力边界必须保留：** 首版模型禁用工具，没有自主全库检索、数据库查询、Web 登录或图片二进制上传。可以分析调用方资料及管理员授权项目中显式指定的源码行段。调用方资料、源码片段、运行现场和数据库事实不能互相替代。这个后端分析入口不等同于页面咨询的全部工具能力。

## 二、双方接线及分工

```text
飞书消息入库
→ yoooni-agent / DeepSeek 判断是否为 IT 问题
→ 是：建问题，保存 requestId 和完整分析输入
→ Forge：认证、登记分析任务、执行、校验结果与证据
→ yoooni-agent：保存 taskId、原始分析、依据及状态
→ DeepSeek：整理三条通俗、可独立选择且结论一致的候选
→ 人工选择、修改并保存
→ 人工确认后，由 yoooni-agent 的发送队列发送飞书
```

接入方在自己的工程实现后端客户端、任务状态恢复、候选及来源保存、人工选择和发送控制。本次 Forge 没有代改这些功能，也没有代替接入方完成真实流程验收。

Forge 分析任务有独立 taskId，不自动成为页面上的咨询或历史问答。`conversationId` 只做调用方业务关联，不自动接续模型线程。每次提交由接入方选择必要近期上下文，不传完整聊天历史。

## 三、Forge 管理员先交付什么

1. 确认测试目标版本包含 `5cd15729c`，启用 `FORGE_CONSULT_BACKEND_ENABLED=true`，保持平台认证开启，并核对现有默认 AI 账号可用。需要加载版本时须单独取得本次重启授权，通过 `node forge.mjs` 执行；本交接不代表已获重启授权。
2. 确认真实 HTTPS 站点根地址和代理的 Authorization 转发。当前**没有已验证的测试 Base URL**；本机端口和 `https://forge-test.example.com` 不能当作对外可用地址。不要开放 Sidecar 端口。
3. 确定内部企业 tenantId 和允许的 ProjectCatalog 稳定项目 ID。授权名称不是 ID；`projectIds: []` 可以先闭环验证调用方资料分析，但不含源码证据。同事使用本机 Forge 时，由该本机实例颁发，不向另一台开发电脑申请。
4. 由 Forge 管理员使用自己的管理员身份创建应用授权。优先使用 **业务咨询 → 配置 → 外部应用接入 → 管理应用接入凭据**（`/tools/fore-consult/access`），填写应用、企业、有效期与项目范围，颁发后保存当次私有配置。分析开关关闭时也可先准备授权，换票仍须先启用；页面不自动重启服务。服务账号不是平台注册员工；不要让接入方保存管理员 Token。需要脚本接入时，API 如下。

   ```http
   POST /api/fore-consult/backend-clients
   Authorization: Bearer <Forge管理员Token，仅管理员操作使用>
   Content-Type: application/json
   ```

   ```json
   {"appId":"yoooni-agent","tenantId":"company-test","projectIds":[],"expiresAt":1800000000000}
   ```

   `company-test` 是占位企业标识；`expiresAt` 是毫秒时间戳，按实际申请时间替换，必须在未来且不超过一年。clientSecret 仅返回一次，通过现有 Secret 管理或密码管理器交付，不写入正文、群消息、源码或日志。完整申请、轮换、续期和撤销见接口文档。
5. 核验目标版本 ready、HTTP 认证及一次测试任务，并依仓库规则完成运行验收和稳定观察。只有这一步完成，才能将环境状态改为“已开放联调”。

管理员给接入方的环境回执应填全以下项目，真实凭据另走安全渠道：

| 回执项 | 当前值 / 待填写 |
|---|---|
| 测试 HTTPS Base URL | 待 Forge 管理员确认并实际验证 |
| 已加载源码版本、启用时间 | 待启用后填写 |
| appId / agentId | `yoooni-agent` / `it-support-partner` |
| tenantId / clientId | 待授权后填写；必须与应用配置一致 |
| 获准 projectIds 及业务名称映射 | 待授权后填写；可为空，不代表自动授权所有系统 |
| 凭据到期时间、轮换交付渠道 | 待授权后填写，不附 secret |
| 真实测试 taskId / requestId / 结果 | 待真实联调后填写 |

应用和企业范围随 clientId 固定，任务仅允许创建它的 clientId 查询或取消。同一企业重新创建 clientId 也不能读取旧 clientId 的任务；需要保留原任务访问时优先轮换原凭据。凭据最长一年，短期票据最长 900 秒；轮换或撤销立即使旧凭据和旧票据失效。

## 四、yoooni-agent 如何接入

### 安装与私有配置

从交付 ZIP 取出 tarball，在 yoooni-agent 工程的后端目录安装；尚未发布公共 npm：

```powershell
npm install ./kai-forge-consult-client-0.2.0.tgz
```

仅在服务器配置以下变量，不使用 `VITE_` 等客户端注入前缀：

| 变量 | 来源 |
|---|---|
| `FORGE_BASE_URL` | 管理员实际验证的 HTTPS 站点根地址，不含 `/api` |
| `FORGE_CLIENT_ID` | 本应用授权返回的 clientId |
| `FORGE_CLIENT_SECRET` | Secret 管理注入，不是 Forge/中台/数据库/模型的其他凭据 |
| `FORGE_TENANT_ID` | 与该 clientId 授权的 tenantId 完全一致 |

示例另外使用 `IT_PROBLEM_ID`、`IT_REQUEST_ID`，来自本应用已持久化的问题和请求。收到上述环境回执后，可运行随包示例 `node examples/backend.mjs`；示例只发测试分析，不发送飞书。SDK 为 ESM；其他语言可直接按 OpenAPI 调用 HTTPS。

### 最小接线与业务字段映射

```js
import { ForgeConsultBackendClient } from '@kai/forge-consult-client/backend';

const forge = new ForgeConsultBackendClient({
  baseUrl: process.env.FORGE_BASE_URL,
  clientId: process.env.FORGE_CLIENT_ID,
  getClientSecret: () => process.env.FORGE_CLIENT_SECRET,
});
// input 使用 BACKEND.md 的完整脱敏请求；调用前在本应用保存完整输入和 requestId。
// receipt 为登记回执，不表示分析成功。
const receipt = await forge.submit(input);
const task = await forge.get(receipt.taskId);
```

以上是接线片段，`input` 由业务层构造；完整可运行示例在交付文件中。SDK 自动换票及缓存短期票据，不会自动重发业务问题。

| 业务信息 | 接口字段 / 处理方式 |
|---|---|
| 应用标识 | 绑定在 clientId 授权中，请求体不再传 appId |
| 业务 Agent | `agentId: "it-support-partner"` |
| 内部企业 | `tenantId`，与授权严格一致 |
| 问题 / 消息会话 / 幂等请求 | `problemId` / `conversationId` / `requestId` |
| 标题、原始描述、近期上下文 | `title` / `description` / `recentContext` |
| DeepSeek 判断及理由 | `classification: {decision: "IT", reason: "…"}`，属于待核实输入 |
| ERP、SRM、PLM 等系统 | `systemIds` 必须使用管理员交付的稳定 ID，不传显示名冒充 ID |
| 报错、附件提取文字 | `errorText` / `attachmentTexts: [{id,name,text}]` |
| 明确源码证据 | `evidenceRefs: [{projectId,path,startLine,endLine}]`，项目必须获准且包含在 systemIds 中 |

附件首版由接入方提取文字；文件名、附件 URL 或截图描述不代表 Forge 已读取原文件。不得把用户密码、数据库凭据、模型密钥或完整聊天历史放进输入。字段长度、证据路径限制、完整 JSON 和返回示例见 [接口合同](BACKEND.md)。

### 接口、状态与可靠性

| 操作 | HTTPS 方法与路径 / SDK |
|---|---|
| 换票 | `POST /api/fore-consult/v1/token`，Basic(clientId:clientSecret)，表单 `grant_type=client_credentials`；SDK 自动处理 |
| 提交 | `POST /api/fore-consult/v1/analysis-tasks` → 202；`forge.submit(input)` |
| 查询 | `GET /api/fore-consult/v1/analysis-tasks/{taskId}`；`forge.get(taskId)` |
| 未知提交结果恢复 | `GET /api/fore-consult/v1/analysis-tasks?requestId=...`；`forge.find(requestId)` |
| 取消 | `POST /api/fore-consult/v1/analysis-tasks/{taskId}/cancel`；`forge.cancel(taskId)` |

业务接口使用应用短期 `Authorization: Bearer <access_token>`。不需要 WSS、员工登录或 MCP，也不复用中台目录服务凭据。建议每 2–3 秒轮询一次。

- `QUEUED/RUNNING/CANCEL_REQUESTED`：非终态；取消申请不等于执行器已停止。
- `SUCCEEDED/NEEDS_INFORMATION`：可读取经过结构校验的 `result`。信息不足时呈现追问，不编造已查明的原因；成功分析也不代表已经修复。
- `FAILED/CANCELLED/TIMED_OUT/INTERRUPTED`：没有成功分析，保留问题、附件和人工草稿，提供恢复动作。
- 同 clientId、同 requestId、完全相同输入复用同一任务；同键改内容返回 409。网络超时先按原 requestId 查询，必要时原键原输入重试；不能因为 HTTP 超时生成新键。
- 已明确终态且决定重新分析，才显式分配新 requestId，并关联原任务。`retryable=true` 不意味着可以自动换键重复执行业务。
- 401 检查到期/轮换/撤销，403 核对企业或项目，404 也可能是任务不属于该 clientId；429 遵循 Retry-After，503 核对接口启用状态。不改用管理员 Token 绕过。
- SDK 单次 HTTP 超时默认 15 秒；任务执行默认上限 180 秒，两者不同。每 clientId 最多 8 个未完成任务、120 次业务请求/分钟；全局最多 64 个未完成任务、同时运行 2 个。首版只支持单实例消费。

### 分析结果到三条人工候选

接入方使用 `understanding/category/facts/possibleCauses/recommendations/missingInformation/unknowns/humanHandoff` 生成候选，同时保留 `evidence/evidenceLimitations`，不将推测转成事实。`replyCandidatesGeneratedBy=CALLER` 明确候选由接入方生成。

三条候选可以是同一事实下不同表述、不同信息收集顺序或处理路径，不能给三个互相矛盾的根因，也不能把“建议排查”说成“已经修复”。无成功分析时不展示伪造的 Forge 分析候选。

本应用至少保存：原问题及输入、requestId/taskId、分析状态及结果、policyVersion、原始三条候选及生成来源、选择项、人工修改后的最终回复、确认发送状态。重新打开后能读取来源和最终回复。租户、用户、问题和附件访问权由本应用继续校验，共用应用凭据不能替代业务用户权限。

## 五、联调验收与回执

Forge 已通过宿主编译、34 项定向后端测试、14 项 SDK 测试，tarball 独立安装及 TypeScript 严格检查；OpenAPI 已做 YAML/本地引用解析。项目质量门禁通过，但既有运行检查不代表新 API 已加载，以上均不能替代真实模型与跨系统验收。完整验证记录保存在仓库 `openspec/changes/consult-backend-analysis/tasks.md`。

启用后由双方共同完成：

1. 一条脱敏真实测试问题：应用认证 → 指定能力 → taskId 和有范围说明的分析依据 → 三条候选 → 人工编辑保存 → 重开能读来源和最终回复。
2. 相同请求重复提交只生成一个任务；同键不同内容拒绝；模拟提交断线后可按原键恢复。
3. 用另一个应用/企业凭据访问任务被拒绝；越权项目被拒绝；不泄漏其他任务资料。
4. 认证失败、信息不足、执行超时和取消时，问题、输入和草稿保留；未经人工确认不会发送飞书。
5. 无源码/现场证据时清楚提示缺口；有获准源码引用时保留可追溯出处，不将其说成现场运行已核验。

请接入方回传：实际应用版本、测试环境、requestId/taskId、候选与来源保存及重开结果、人工确认前未发送的验证结果、剩余问题。异常提供脱敏错误 code/traceId、状态及时间，不传 secret、Token、Cookie 或完整业务聊天。

**当前仍待 Forge 处理的交付项：** 授权后加载服务、启用接口、确认真实 HTTPS 地址、签发本应用凭据、真实多应用隔离和模型联调及稳定观察。没有这些回执，不标记“已上线可直接调用”。

**DDL 未核验：** 新增 `consult_service_client/consult_service_token/consult_analysis_task` 未命中既有 DDL 基线，结构来自本次源码 schema，应用启动自动创建，无需接入方手工执行 SQL。本交接仅补充现有接口的使用说明，无架构契约变化。
