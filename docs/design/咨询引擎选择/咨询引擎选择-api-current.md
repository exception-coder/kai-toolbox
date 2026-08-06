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
