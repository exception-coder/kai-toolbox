# AI 对话 接口契约

> 配套设计文档：`AI对话-current.md`。本文件是接口字段级契约与建表 DDL 的唯一权威载体。
> 基址：`/api/ai-chat`。所有路径相对此基址。

## 接口清单

| 方法 | 路径 | 用途 | 实现类#方法 |
|------|------|------|-------------|
| GET | `/models` | 可用模型清单 + 角色预设 | `ModelController#models` |
| GET | `/conversations` | 会话列表（倒序） | `ConversationController#list` |
| POST | `/conversations` | 新建会话 | `ConversationController#create` |
| GET | `/conversations/{id}` | 会话详情（模型/system/参数） | `ConversationController#get` |
| PATCH | `/conversations/{id}` | 改标题/模型/system/参数 | `ConversationController#update` |
| DELETE | `/conversations/{id}` | 删除会话（级联消息） | `ConversationController#delete` |
| GET | `/conversations/{id}/messages` | 分页拉历史消息 | `ConversationController#messages` |
| POST | `/completions` | 发送消息，返回 taskId | `CompletionController#send` |
| GET | `/completions/{taskId}/events` | SSE 订阅 token 流 | `CompletionController#events` |
| POST | `/completions/{taskId}/stop` | 停止生成 | `CompletionController#stop` |
| POST | `/attachments` | 上传图片附件 | `AttachmentController#upload` |
| GET | `/attachments/{id}` | 下载/预览附件 | `AttachmentController#download` |

---

## 1. GET /models

模型清单**实时取自 4sapi `GET /v1/models`**（后端代理 + 缓存 `modelsCacheTtlSeconds`）；4sapi 不可用时回退 `AiChatProperties.fallbackModels` 静态清单。多模态位按 `multimodalPatterns` 匹配模型 id 推断。

**Query**：`?refresh=true`（可选，跳过缓存强制重新拉取）。

**响应 200**
```json
{
  "models": [
    { "id": "gpt-4o", "label": "GPT-4o", "multimodal": true },
    { "id": "claude-sonnet-4", "label": "claude-sonnet-4", "multimodal": true },
    { "id": "deepseek-chat", "label": "deepseek-chat", "multimodal": false }
  ],
  "presets": [
    { "id": "default", "label": "默认助手", "systemPrompt": "" },
    { "id": "translator", "label": "翻译助手", "systemPrompt": "你是专业翻译，..." }
  ],
  "source": "remote"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| models[].id | string | 4sapi `/v1/models` 返回的模型 id，原样传给补全接口 |
| models[].label | string | UI 展示名；默认取 id，命中 `modelLabels` 映射则美化 |
| models[].multimodal | boolean | 按 `multimodalPatterns` 匹配 id 推断 |
| presets[] | RolePreset[] | 角色预设；选中即把 systemPrompt 填入新会话 |
| source | enum | `remote`（取自 4sapi）/ `fallback`（4sapi 失败回退静态清单） |

**错误**：本接口不抛错——4sapi 失败时回退静态清单并标 `source=fallback`。

---

## 2. POST /conversations

**请求体**
```json
{ "title": "新对话", "model": "gpt-4o", "systemPrompt": "", "temperature": 0.7, "maxTokens": null }
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 否 | 缺省后端生成「新对话」；可后续按首条消息自动命名 |
| model | string | 是 | 须在 `/models` 清单内，否则 400 |
| systemPrompt | string | 否 | 会话级系统提示，缺省空 |
| temperature | number | 否 | [0,2]，缺省取配置默认 |
| maxTokens | number\|null | 否 | >0，缺省不限（由模型/中转决定） |

**响应 200**（`ConversationView`）
```json
{
  "id": "c_a1b2c3",
  "title": "新对话",
  "model": "gpt-4o",
  "systemPrompt": "",
  "temperature": 0.7,
  "maxTokens": null,
  "createdAt": "2026-06-18T10:00:00+08:00",
  "updatedAt": "2026-06-18T10:00:00+08:00"
}
```

**错误**：`400` model 不在清单 / 参数越界。

---

## 3. GET /conversations

**响应 200**：`ConversationView[]`（按 `updatedAt` 倒序）。

## 4. GET /conversations/{id}

**响应 200**：`ConversationView`。**错误**：`404` 不存在。

## 5. PATCH /conversations/{id}

**请求体**（字段级，传哪个改哪个）
```json
{ "title": "改个名", "model": "claude-sonnet-4", "systemPrompt": "...", "temperature": 0.5, "maxTokens": 2048 }
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title / model / systemPrompt / temperature / maxTokens | 同建会话 | 否 | 至少传一个；model 仍须在清单内 |

**响应 200**：更新后的 `ConversationView`。**错误**：`400` 非法值；`404` 不存在。

## 6. DELETE /conversations/{id}

**响应 200**：`{ "deleted": true }`，级联删除该会话所有消息与附件。幂等。**错误**：`404` 不存在。

---

## 7. GET /conversations/{id}/messages

**Query**：`?before={messageId}&limit=30`（缺省 limit 30，倒序往前翻）。

**响应 200**（`MessagePage`）
```json
{
  "messages": [
    {
      "id": "m_001",
      "conversationId": "c_a1b2c3",
      "role": "USER",
      "content": "你好",
      "model": null,
      "attachments": [],
      "status": "DONE",
      "createdAt": "2026-06-18T10:01:00+08:00"
    },
    {
      "id": "m_002",
      "conversationId": "c_a1b2c3",
      "role": "ASSISTANT",
      "content": "你好！有什么可以帮你？",
      "model": "gpt-4o",
      "attachments": [],
      "status": "DONE",
      "createdAt": "2026-06-18T10:01:03+08:00"
    }
  ],
  "hasMore": false
}
```

**MessageView**

| 字段 | 类型 | 说明 |
|------|------|------|
| role | enum | `USER/ASSISTANT/SYSTEM` |
| content | string | 文本内容（助手 interrupted 时为已生成部分） |
| model | string\|null | 助手消息所用模型；用户消息为 null |
| attachments | AttachmentView[] | `{id,name,mime,url}`，仅多模态用户消息 |
| status | enum | `DONE/INTERRUPTED/ERROR` |

---

## 8. POST /completions

发送一条用户消息，触发异步流式补全，立即返回 taskId。

**请求体**
```json
{
  "conversationId": "c_a1b2c3",
  "content": "帮我解释下闭包",
  "attachmentIds": [],
  "model": "gpt-4o",
  "temperature": 0.7,
  "maxTokens": null
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| conversationId | string | 是 | 会话须存在 |
| content | string | 是 | 用户文本；空且无附件则 400 |
| attachmentIds | string[] | 否 | 已上传附件 id；非多模态模型传图 → 400 |
| model | string | 否 | 覆盖会话默认模型；省略用会话默认；非清单内 400；传入即 PATCH 持久化为会话默认 |
| temperature / maxTokens | number | 否 | 覆盖会话默认；范围同建会话 |

**响应 200**
```json
{ "taskId": "t_x1y2z3" }
```

**错误**：`400` content 与附件皆空 / 非多模态模型带图 / 参数越界；`404` 会话不存在。

---

## 9. GET /completions/{taskId}/events （SSE）

`text/event-stream`。事件序列：

```
event: token
data: {"delta":"闭"}

event: token
data: {"delta":"包是"}

event: done
data: {"messageId":"m_010","status":"DONE","content":"闭包是..."}
```

| 事件 | data | 说明 |
|------|------|------|
| token | `{ "delta": string }` | 流式增量片段 |
| done | `{ messageId, status, content }` | 终止：`status` ∈ `DONE/INTERRUPTED/ERROR`；`content` 为完整文本 |
| error | `{ "message": string }` | 调用 4sapi 失败（鉴权/限流/超时）；随后 done(ERROR) |

> 终态（done）推送后服务端 complete。前端凭 done 的 `messageId` 与历史对齐。

---

## 10. POST /completions/{taskId}/stop

**响应 200**：`{ "stopped": true }`（已生成部分落库为 INTERRUPTED 消息）。幂等：已结束则返回 `{ "stopped": false }`。

---

## 11. POST /attachments

`multipart/form-data`，字段 `file`（图片）+ `conversationId`。

**响应 200**（`AttachmentView`）
```json
{ "id": "att_001", "name": "shot.png", "mime": "image/png", "url": "/api/ai-chat/attachments/att_001" }
```

**错误**：`400` 非图片 / 超应用层大小上限；`413` 超 multipart 上限。

## 12. GET /attachments/{id}

成功返回对应 `Content-Type` 的二进制（`startsWith` 越权防护）。**错误**：`404` 不存在。

---

## 数据结构（建表 DDL）

> 落 `tools/tool-ai-chat/src/main/resources/db/ai-chat-schema.sql`，全部 `IF NOT EXISTS`，注释内不得出现分号。

**ai_chat_conversation**

| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PRIMARY KEY | 会话 id |
| title | TEXT | 标题 |
| model | TEXT NOT NULL | 当前默认模型名 |
| system_prompt | TEXT | 系统提示，可空 |
| temperature | REAL | 采样温度，可空（取配置默认） |
| max_tokens | INTEGER | 最大输出 token，可空 |
| created_at | INTEGER NOT NULL | 毫秒时间戳 |
| updated_at | INTEGER NOT NULL | 毫秒时间戳；发消息/改设置时刷新 |

索引：`idx_ai_chat_conv_updated ON ai_chat_conversation(updated_at DESC)`

**ai_chat_message**

| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PRIMARY KEY | 消息 id |
| conversation_id | TEXT NOT NULL | 所属会话 |
| role | TEXT NOT NULL | `USER/ASSISTANT/SYSTEM` |
| content | TEXT | 文本内容 |
| model | TEXT | 助手消息所用模型，可空 |
| attachments_json | TEXT | 附件引用 JSON 数组，可空 |
| status | TEXT NOT NULL | `DONE/INTERRUPTED/ERROR` |
| created_at | INTEGER NOT NULL | 毫秒时间戳 |

索引：`idx_ai_chat_msg_conv ON ai_chat_message(conversation_id, created_at)`

> 删除会话时按 `conversation_id` 级联删消息（应用层删，不依赖 FK 级联）。

---

## 错误响应统一格式

走项目 `GlobalExceptionHandler`，统一结构（前端 `api.ts` 读 `message` 字段）：
```json
{ "timestamp": "2026-06-18T02:00:00Z", "status": 400, "error": "Bad Request", "message": "model 不在可用清单内" }
```
后端用 `throw new ResponseStatusException(BAD_REQUEST/NOT_FOUND, "...")` 表达受控 4xx（common 已新增对应处理器，尊重状态码）。
