# 咨询引擎选择协议变更

## 1. 浏览器到 Java

WebSocket `open` 消息新增可选字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `engine` | string | 否 | `claude` 或 `codex`，默认 `claude` |
| `codexHome` | string | 否 | Codex 官方登录配置根目录；空值使用默认目录 |

## 2. Java 到 sidecar

`start` 与 `resume` 消息新增同名可选字段 `codexHome`。sidecar 不向浏览器回传目录内容，仅将其用于创建 Codex SDK 客户端。

## 3. 会话查询

`GET /api/claude-chat/sessions` 的 `ClaudeChatSessionView` 新增可空字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `codexHome` | string / null | 官方 Codex 会话绑定的授权目录；空值表示默认 `%USERPROFILE%\.codex` |

接口只返回目录路径元数据，不读取或返回目录内的 `auth.json`、token 等认证内容。第三方网关会话不使用该字段。

## 4. 咨询归档扩展

- `GET /api/fore-consult/model-policy` 返回业务咨询的服务端权威策略：`model`、`displayName`、`codexHome`、`updatedAt`，以及 `version`、`validationCode`、`checkedAt`。存量未检测配置版本为 0，不代表账号可用。
- `PUT /api/fore-consult/model-policy` 仅管理员可用，请求体为 `{"model":"...","displayName":"...","codexHome":"..."}`；Auth 必须命中服务端当前发现目录，并通过受控登录、工作区授权与模型目录检测。检测不发送业务问题；失败保留原配置，成功生成版本。
- `GET /api/fore-consult/model-policy/audit` 仅管理员可用，返回最近 50 条操作者、原账号、目标账号、模型、检测结果与时间。失败审计不改变当前策略版本，不含 token。
- `POST /api/fore-consult/sessions` 保留兼容的可选 `codexHome` 入参，但服务端不会采用该值；所有用户的新咨询统一使用上述策略中的 Auth，未配置时返回 HTTP 409。
- 已创建会话继续返回 `ConsultSessionView.codexHome` 作为创建来源；实际每轮执行重新读取默认账号和版本，不采用旧页面或创建快照的账号。历史咨询保留原模型，缺失才使用默认模型；目标账号不支持时明确报错。
- 平台聊天 ID 与附件授权不变；账号变化时创建新原生线程段，切回旧账号也重新交接当前历史。正在运行的轮次保持原账号；已归档咨询不能发送。业务咨询 `send.messageId` 必填，持久去重，不自动重放发送结果未知的问题。开发会话不采用这套账号策略。
- 咨询历史消息接口优先读取平台日志，补充可空 `historyGap`；存在缺口时显示警告。原账号失效不阻止已保存历史读取。
- `GET /api/fore-consult/context/sessions/{runtimeId}?offset=0&maxChars=16000` 供 `read_consult_history` 工具按 Unicode 字符分页；`maxChars` 为 1～50000，响应含 `offset/nextOffset/complete/text/gap/documents`。必须携带服务端签发的当前咨询 `X-Consult-Resource-Token`，不能使用另一咨询的签名。
- 原附件图片通过原签名附件读取接口返回 `{kind:"image",name,mimeType,data}`，工具转换为图片内容；路径、登记身份、大小与图片格式仍按原会话核验。生成文件引用与预览保持原咨询权限。

以上新增统一账号协议尚待服务加载及真实多账号验收，状态见[任务](../../../openspec/changes/unify-consult-runtime-account/tasks.md)。
- `POST /api/fore-consult/sessions` 新增必填字段 `questionTitle`，格式为 `yyMMdd-用户标题`；日期按用户本机当前时刻换算到 UTC，总长度不超过 40 字符。
- `ConsultSessionView.questionTitle` 表示用户填写并添加 UTC 日期前缀后的归档标题；存量空标题仍兼容回退展示。
- `PATCH /api/fore-consult/sessions/{id}/question-title`：重命名历史咨询标题。请求体为 `{"title":"用户标题"}`，标题正文必填且不超过 33 字；服务端保留或补齐 UTC 日期前缀并返回更新后的 `ConsultSessionView`。
- `POST /api/fore-consult/sessions/{id}/classify-question`

请求：

```json
{"question":"新的用户输入","firstQuestion":"首个明确问题"}
```

`firstQuestion` 用于首轮尚未增量归档时的识别兜底；后端已有首问记录时，以归档数据为准。

响应：

```json
{"classification":"FOLLOW_UP","reason":"继续询问原问题的处理结果"}
```

`classification` 只允许 `FOLLOW_UP | NEW_QUESTION`。分类失败时服务端返回 `FOLLOW_UP` 作为无阻断降级。

## 5. 系统链路分析

`POST /api/fore-consult/topology` 请求：

```json
{
  "systems": ["ERP", "SCM", "SRM"],
  "engine": "claude"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `systems` | string[] | 是 | 当前可见的系统原名，至少两个 |
| `engine` | string | 否 | `claude` 或 `codex`；旧客户端未传时使用 `claude` |

响应仍为 `{"links": [...]}`。非空结果替换已持久化链路；空结果表示本次没有发现可信关系，不清空上一次持久化结果。非法引擎返回 HTTP 400，执行失败返回现有错误响应。
