# 咨询引擎选择编码摘要

## 1. 数据与协议

- `claude_chat_session.codex_home`：保存会话级 Codex 授权目录，空值表示默认目录。
- 浏览器 `open` 消息新增可选 `codexHome`。
- Java 到 sidecar 的 `start` / `resume` 消息透传 `codexHome`。
- sidecar `Session` 持有 `codexHome`，Codex 每轮执行时交给 `codexEngine`。

## 2. 前端落点

- `ForeConsultPage.tsx`：引擎选择、Codex 授权目录输入、本地记忆，并在 `chat.open` 时透传。
- `useClaudeChatSocket.ts` 与 `types.ts`：扩展 `open` 协议参数。

## 3. 后端与 sidecar 落点

- `ClientMessage.Open`、`ClaudeChatService`、`SidecarClient`：接收、持久化并透传授权目录。
- `ClaudeChatSession`、`ClaudeChatSessionRepository`、`ClaudeChatSchemaMigration`：会话元数据落库与旧库迁移。
- `sessionManager.ts`、`codexEngine.ts`：会话级保存并通过 Codex SDK `env` 注入 `CODEX_HOME`。

## 4. 安全约束

- 不记录目录内认证内容，不读取或回传 `auth.json`。
- 日志只允许记录会话和引擎，不输出 token。
- 不自动创建授权目录，不代替用户执行登录。
