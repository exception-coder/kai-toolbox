# 咨询引擎选择协议变更

## 1. 浏览器到 Java

WebSocket `open` 消息新增可选字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `engine` | string | 否 | `claude` 或 `codex`，默认 `claude` |
| `codexHome` | string | 否 | Codex 官方登录配置根目录；空值使用默认目录 |

## 2. Java 到 sidecar

`start` 与 `resume` 消息新增同名可选字段 `codexHome`。sidecar 不向浏览器回传目录内容，仅将其用于创建 Codex SDK 客户端。

## 3. 咨询归档扩展

- `ConsultSessionView` 新增 `questionTitle`，表示由首个明确问题生成的归档标题。
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
