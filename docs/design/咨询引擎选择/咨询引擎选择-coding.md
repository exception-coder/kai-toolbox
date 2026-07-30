# 咨询引擎选择编码摘要

## 1. 数据与协议

- `claude_chat_session.codex_home`：保存会话级 Codex 授权目录，空值表示默认目录。
- 浏览器 `open` 消息新增可选 `codexHome`。
- Java 到 sidecar 的 `start` / `resume` 消息透传 `codexHome`。
- sidecar `Session` 持有 `codexHome`，Codex 每轮执行时交给 `codexEngine`。

## 2. 前端落点

- `ForeConsultPage.tsx`：引擎选择、Codex 授权目录输入、本地记忆，并在 `chat.open` 时透传。
- `ChatPage.tsx`：Vibe Coding 新建 Codex 官方会话时复用授权目录偏好，在 `chat.open` 的 provider 参数中透传；第三方网关模式不传。
- `ClaudeChatSessionView` 与 `CodexSessionOptions.tsx`：会话列表返回 `codexHome` 元数据，当前官方 Codex 会话在参数区只读展示默认目录或自定义目录。
- `useClaudeChatSocket.ts` 与 `types.ts`：扩展 `open` 协议参数。

## 3. 后端与 sidecar 落点

- `ClientMessage.Open`、`ClaudeChatService`、`SidecarClient`：接收、持久化并透传授权目录。
- `ClaudeChatSession`、`ClaudeChatSessionRepository`、`ClaudeChatSchemaMigration`：会话元数据落库与旧库迁移。
- `sessionManager.ts`、`codexEngine.ts`：会话级保存并通过 Codex SDK `env` 注入 `CODEX_HOME`。

## 4. 安全约束

- 不记录目录内认证内容，不读取或回传 `auth.json`。
- 会话查询只回传授权目录字符串，不探测目录内容或登录凭据。
- 日志只允许记录会话和引擎，不输出 token。
- 不自动创建授权目录，不代替用户执行登录。

## 5. 执行审计落点

- `consultAudit.ts`：按用户消息切分轮次，从 `ChatItem` 中识别业务知识图谱、Graphify、测试库调用和 BUG 块，输出统一审计模型。
- `ConsultConversation.tsx`：在每轮最终回答下展示四类状态标记；点击标记可查看实际工具名、输入和输出摘要。
- 只依据真实 `tool` 消息和最终回答判定，不以 MCP 已注册、提示词已包含或普通源码读取代替“已查询”。
- 查询输入和输出只保留界面摘要，不重复写入新存储；完整事件继续由现有 `rawReferenceJson` 持久化。
- 数据库红线规则：测试环境声明与截图/单据线索均从本轮用户可见问题中识别；发生测试库工具调用且命中后者、未命中前者时标记疑似违规。

## 6. 单问题会话落点

- `consult_session.question_title`：首轮问题标题，旧库通过迁移补列；首次同步轮次时仅在空值情况下写入。
- `ConsultService`：从 `AuthContext` 读取当前登录用户，前端传入用户仅作为无登录态兼容兜底；负责标题归一化和只写一次。
- `ConsultQuestionClassifier`：调用 `AgentOneShotRunner` 对首问与新输入做 `FOLLOW_UP | NEW_QUESTION` 二分类；输出按不可信入参解析和白名单校验，失败降级为 `FOLLOW_UP`。
- `POST /api/fore-consult/sessions/{id}/classify-question`：返回分类枚举和简短理由。
- `ConsultConversation.tsx`：追问发送前调用分类接口；新问题弹窗提供“结束当前咨询”和“仍作为追问”，结束后回到系统选择区新建会话。
- 历史列表及详情优先展示 `questionTitle`，为空的存量记录退化为系统名。

## 7. 多进行中会话

- `ForeConsultPage.tsx` 不再用 `activeConsultId` 禁止打开其他系统或创建新咨询。
- `activeConsultId` 仅表示当前展示和同步的咨询，不代表系统中唯一的 `PENDING` 会话。
- 切换会话继续复用历史列表的 `resumeConsult`，后端会话状态与接口无需调整。
