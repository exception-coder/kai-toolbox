# AI 对话 编码摘要

> 本文档由 `AI对话-current.md` 精简而来，聚焦实现所需的最小必要信息（每个方法怎么写）。
> 字段级契约与建表 DDL 见 `AI对话-api-current.md`。
> 包根：`com.exceptioncoder.toolbox.aichat`，REST 基址 `/api/ai-chat`，表前缀 `ai_chat_`。

---

## 变更记录

| 版本 | 日期 | 变更内容摘要 |
|------|------|--------------|
| current | 2026-06-18 | 初始版本：4sapi 直连流式聊天 + 多会话持久化 + 动态模型清单 |

---

## 1. 核心业务规则

- 模型清单实时调 4sapi `GET /v1/models`，缓存 `modelsCacheTtlSeconds`；失败回退 `fallbackModels`，标 `source=fallback`。
- 多模态位按 `multimodalPatterns` 匹配模型 id 推断；仅 `multimodal=true` 的模型允许带图，否则发送请求 400。
- 每会话存默认 `model`；发送时若带 `model` 则覆盖本轮并 PATCH 持久化为会话默认。
- 发送时取该会话最近 `maxHistoryMessages` 条消息拼上下文（含会话 systemPrompt 作为首条 system）；超出丢最早。
- 一次发送 = 一个 `taskId` 的 SSE 频道；token 增量走 `event:token`，终止走 `event:done`，4sapi 报错走 `event:error` 后 done(ERROR)。
- 助手消息**仅在 onCompleteResponse 或 stop 时落库**；流式中途不写库。stop 落已生成部分并标 `INTERRUPTED`。
- temperature ∈ [0,2]、maxTokens>0；越界 400；缺省取 `AiChatProperties` 默认。
- 4sapi 连接参数（base-url/api-key/默认参数/模型相关）走 `@Refreshable`，配置变更后 `ChatModelFactory` 与 `ModelCatalogService` 清缓存。
- 附件落 `data-dir/ai-chat/attachments/{conversationId}/`；下载 `normalize().startsWith(根)` 防穿越。
- 删会话级联删消息与附件（应用层删）。
- schema.sql 全部 `CREATE TABLE/INDEX IF NOT EXISTS`，注释内无分号。

---

## 2. 接口入口指针

> 字段级契约见 `AI对话-api-current.md`。

| 接口 | 实现类 #方法 |
|------|-------------|
| `GET /api/ai-chat/models` | `ModelController#models` |
| `GET /api/ai-chat/conversations` | `ConversationController#list` |
| `POST /api/ai-chat/conversations` | `ConversationController#create` |
| `GET /api/ai-chat/conversations/{id}` | `ConversationController#get` |
| `PATCH /api/ai-chat/conversations/{id}` | `ConversationController#update` |
| `DELETE /api/ai-chat/conversations/{id}` | `ConversationController#delete` |
| `GET /api/ai-chat/conversations/{id}/messages` | `ConversationController#messages` |
| `POST /api/ai-chat/completions` | `CompletionController#send` |
| `GET /api/ai-chat/completions/{taskId}/events` | `CompletionController#events` |
| `POST /api/ai-chat/completions/{taskId}/stop` | `CompletionController#stop` |
| `POST /api/ai-chat/attachments` | `AttachmentController#upload` |
| `GET /api/ai-chat/attachments/{id}` | `AttachmentController#download` |

---

## 3. 涉及类清单（全路径）

| 全路径 | 操作 | 说明 |
|--------|------|------|
| `com.exceptioncoder.toolbox.aichat.api.ConversationController` | 新建 | 会话/消息 CRUD |
| `com.exceptioncoder.toolbox.aichat.api.CompletionController` | 新建 | 发送 + SSE + 停止 |
| `com.exceptioncoder.toolbox.aichat.api.ModelController` | 新建 | 模型清单 + 角色预设 |
| `com.exceptioncoder.toolbox.aichat.api.AttachmentController` | 新建 | 图片上传/下载 |
| `com.exceptioncoder.toolbox.aichat.service.AiChatService` | 新建 | 编排 + 流式回调 + 落库 |
| `com.exceptioncoder.toolbox.aichat.service.ModelCatalogService` | 新建 | 4sapi /v1/models + 缓存 + 多模态推断 + 回退 |
| `com.exceptioncoder.toolbox.aichat.service.ChatModelFactory` | 新建 | 按模型建/缓存 StreamingChatModel |
| `com.exceptioncoder.toolbox.aichat.service.ConversationService` | 新建 | 会话/消息业务 |
| `com.exceptioncoder.toolbox.aichat.service.AttachmentStorageService` | 新建 | 图片落盘 + 越权防护 |
| `com.exceptioncoder.toolbox.aichat.repository.ConversationRepository` | 新建 | Spring JDBC |
| `com.exceptioncoder.toolbox.aichat.repository.MessageRepository` | 新建 | Spring JDBC |
| `com.exceptioncoder.toolbox.aichat.domain.Conversation` | 新建 | 会话实体 |
| `com.exceptioncoder.toolbox.aichat.domain.ChatMessage` | 新建 | 消息实体 |
| `com.exceptioncoder.toolbox.aichat.domain.MessageRole` | 新建 | USER/ASSISTANT/SYSTEM |
| `com.exceptioncoder.toolbox.aichat.domain.MessageStatus` | 新建 | DONE/INTERRUPTED/ERROR |
| `com.exceptioncoder.toolbox.aichat.config.AiChatProperties` | 新建 | @Refreshable，绑定 toolbox.ai-chat.* |
| `com.exceptioncoder.toolbox.aichat.config.AiChatToolDescriptor` | 新建 | 实现 ToolDescriptor |
| `com.exceptioncoder.toolbox.aichat.api.dto.*` | 新建 | 见设计文档 §6 |
| `pom.xml` / `toolbox-starter/pom.xml` | 修改 | 注册模块 + 依赖 |
| `toolbox-starter/.../application.yml` | 修改 | 新增 `toolbox.ai-chat.*` 配置块 |

### 关键方法签名与职责

```
// 编排
AiChatService#send(SendMessageRequest req): String
  — 校验会话与模型；落库 USER 消息；分配 taskId；virtual thread 跑 stream()；返回 taskId
AiChatService#stream(String taskId, Conversation conv, String model, double temp, Integer maxTokens)
  — 取历史(截断)+system 拼 List<ChatMessage>；ChatModelFactory 取流式模型；
    发起 chat(handler)；handler 回调 publish SSE；完成/出错落库助手消息
AiChatService#stop(String taskId): boolean
  — 置 taskId 的取消标志；publish done(INTERRUPTED)；返回是否生效
AiChatService#buildMessages(Conversation conv, List<ChatMessage> history, List<Attachment> imgs): List<dev.langchain4j.data.message.ChatMessage>
  — systemPrompt→SystemMessage；历史→User/AiMessage；本轮含图→UserMessage(TextContent+ImageContent)

// 模型目录
ModelCatalogService#list(boolean refresh): ModelsView
  — refresh 或缓存过期→调 4sapi GET {baseUrl}/models→解析 data[].id→推断 multimodal+label；
    失败→fallbackModels，source=fallback；否则 source=remote
ModelCatalogService#isMultimodal(String modelId): boolean — 按 multimodalPatterns 匹配
ModelCatalogService#assertModelAllowed(String modelId): void — 不在清单内抛 400

// 流式模型工厂
ChatModelFactory#streamingModel(String model, double temp, Integer maxTokens): OpenAiStreamingChatModel
  — 按 (model,temp,maxTokens) 缓存；用 AiChatProperties.baseUrl/apiKey 构建
ChatModelFactory#onConfigChange(EnvironmentChangeEvent e): void — toolbox.ai-chat.* 变更清缓存

// 会话业务
ConversationService#create(CreateConversationRequest): ConversationView
ConversationService#update(String id, UpdateConversationRequest): ConversationView — 字段级更新 + 校验 model
ConversationService#delete(String id): void — 级联删消息 + 附件
ConversationService#messages(String id, String before, int limit): MessagePage — 倒序翻页
ConversationService#appendUserMessage(String convId, String content, List<String> attIds): ChatMessage
ConversationService#appendAssistantMessage(String convId, String model, String content, MessageStatus st): ChatMessage

// 附件
AttachmentStorageService#store(String convId, MultipartFile file): AttachmentView — 校验图片+大小+落盘
AttachmentStorageService#load(String attId): Resource — startsWith 防穿越

// 仓储
ConversationRepository#insert/findById/findAllOrderByUpdatedDesc/updateFields/touchUpdatedAt/deleteById
MessageRepository#insert/findRecent(convId,limit)/pageBefore(convId,before,limit)/deleteByConversation
```

---

## 4. 数据结构

### 关键表（DDL 见 api 文档「数据结构」节）

```
表 ai_chat_conversation：id(PK) / title / model(NOT NULL) / system_prompt / temperature(REAL) /
                         max_tokens(INTEGER) / created_at / updated_at
  索引 idx_ai_chat_conv_updated(updated_at DESC)
表 ai_chat_message：id(PK) / conversation_id(NOT NULL) / role / content / model /
                    attachments_json / status / created_at
  索引 idx_ai_chat_msg_conv(conversation_id, created_at)
```

### 关键 DTO 字段

```java
// SendMessageRequest
String conversationId;   // 必填
String content;          // 必填（content 与 attachmentIds 不可同时空）
List<String> attachmentIds; // 可空；非多模态模型非空→400
String model;            // 可空；覆盖会话默认并持久化
Double temperature;      // 可空 [0,2]
Integer maxTokens;       // 可空 >0

// ModelInfo
String id; String label; boolean multimodal;
```

### AiChatProperties（toolbox.ai-chat.*，@Refreshable）

```
String baseUrl              // 默认 https://4sapi.com/v1
String apiKey               // 走环境变量 TOOLBOX_AI_CHAT_API_KEY
double temperature = 0.7
int timeoutSeconds = 60
int maxHistoryMessages = 40
int modelsCacheTtlSeconds = 300
List<String> multimodalPatterns  // 默认 [gpt-4o, claude, gemini, vision, o1, o3, qwen-vl]
Map<String,String> modelLabels   // 可空 id→展示名
List<ModelInfo> fallbackModels   // /v1/models 失败时兜底
List<RolePreset> presets         // 内置角色预设
```

---

## 5. 重要约束与边界

- 并发：`ChatModelFactory` 缓存用 `ConcurrentHashMap`；`taskId→取消标志` 用 `ConcurrentHashMap<String,AtomicBoolean>`，stop 置位、done 时清除。
- 线程：流式 worker 走 virtual thread；langchain4j `StreamingChatResponseHandler` 回调内只 publish，不阻塞、不再起线程。
- 事务：单表写无需显式事务；删会话的「删消息+删附件目录+删会话行」按顺序执行，附件目录删失败只告警不回滚。
- SSE：复用 `SseEmitterRegistry.create(taskId)` / `publish(taskId, event, payload)`；终态后 `complete`。`spring.mvc.async.request-timeout=-1` 已配。
- 不处理：function calling / 工具 / RAG / 流式中落库 / 多 key 轮换（v1 不做）。

---

## 6. 下游依赖调用

```
// langchain4j（新增 maven 依赖 dev.langchain4j:langchain4j-open-ai，版本对齐 toolbox-llm）
dev.langchain4j.model.openai.OpenAiStreamingChatModel#chat(List<ChatMessage>, StreamingChatResponseHandler)
dev.langchain4j.model.openai.OpenAiStreamingChatModel.builder().baseUrl().apiKey().modelName().temperature().maxTokens().timeout()

// 4sapi 模型清单：用 RestClient/HttpClient GET {baseUrl}/models，Bearer apiKey，解析 {data:[{id}]}
// （langchain4j 无 list-models API，自行轻量 HTTP 调用）
```

---

## 7. 异常处理要点

- 会话不存在 → 404（`GlobalExceptionHandler` 统一 `{error}`）。
- model 不在 `/models` 清单 → 400「model 不在可用清单内」。
- 非多模态模型带 attachmentIds → 400。
- temperature/maxTokens 越界 → 400。
- content 与 attachmentIds 皆空 → 400。
- 4sapi 调用失败（鉴权/限流/超时/网络）→ SSE `event:error{message}` + 助手消息标 `ERROR`，不抛到同步响应、不污染历史。
- `/v1/models` 失败 → 回退 `fallbackModels`，`source=fallback`，不抛错。
- 附件非图片/超限 → 400/413；下载越权 → 404。
```
