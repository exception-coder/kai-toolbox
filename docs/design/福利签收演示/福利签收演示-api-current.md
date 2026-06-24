# 福利签收演示 接口契约

> 配套设计文档：`福利签收演示-current.md`。本文件是 demo 通道接口、约束档与沙箱规则的唯一权威载体。
> demo agent 通道复用 claude-chat 的 WS 消息结构（`ClientMessage`/`ServerMessage`），本文件只列 **demo 专有差异**与新增契约。

## 接口/通道清单

| 类型 | 标识 | 用途 | 实现 |
|------|------|------|------|
| WS | `/api/claude-chat/demo/ws` | 免鉴权 demo agent 通道（建会话前供给一次性副本） | `DemoWebSocketHandler` |
| 内部 | `welfare_db`（agent 工具） | demo agent 改数据的唯一通道，**仅作用本会话 demo SQLite 库** | `sidecar/welfareDb.ts` → `WelfareDemoSqlService` |
| 内部 | `POST /api/claude-chat/demo/sql`（127.0.0.1） | MCP 退化方案：sidecar 直连后端执行受限 SQL | `WelfareDemoSqlService` |

---

## 1. WS `/api/claude-chat/demo/ws`

- **握手**：不要求 `access_token`、不校验 ADMIN（`AdminHandshakeInterceptor` 放行该路径）。
- **建会话副本供给**：`open` 到达后，后端先 `WelfareDemoSandboxProvisioner.provision(sessionId)` 克隆源码 + 建 demo 库，再以副本目录为 cwd 建会话。
- **消息结构**：与正式 `/api/claude-chat/ws` 相同。**demo 强制覆盖**：

| 客户端可传 | demo 实际生效 |
|-----------|--------------|
| `cwd` | 本会话副本目录（Provisioner 返回，固定） |
| `mode` | 忽略（demo 不弹审批，走 canUseTool 硬规则） |
| `engine` | `claude`（固定） |
| `apiBaseUrl` / `authToken` | 强制空 |

- **客户端可用**：`send{text, attachments?}`、`interrupt`。**不提供**：切会话/引擎/模型、改权限模式、会话管理。
- **服务端事件**：复用 `ServerMessage`（`ready`/`assistantDelta`/`toolUse`/`toolResult`/`result`/`error`）；demo 会话**不发** `permissionRequest`。

---

## 2. 约束档 WelfareDemoProperties（`toolbox.welfare-demo.*`）

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| enabled | boolean | false | 是否开启 demo 通道（默认关，显式开；建议走配置中心随开随关） |
| sourcePaths | List\<String\> | `tools/tool-welfare-sign`、`frontend/src/features/welfare-sign` | 克隆来源（相对仓库根，只读复制） |
| sandboxRoot | String | `${data-dir}/welfare-demo` | 副本根目录 |
| allowedTablePrefix | String | `welfare_sign_` | demo 库 SQL 表名白名单前缀 |
| ttlMinutes | int | 30 | 副本存活时长，超时回收 |
| maxConcurrentSandboxes | int | 5 | 并发副本上限，超过拒绝新建演示 |
| copyExcludes | List\<String\> | `target`、`node_modules`、`dist` | 复制时排除目录 |

---

## 3. sidecar canUseTool（demo）裁决规则

> 输入：`toolName` + `input` + 会话 `isDemo` + 副本根 `cwd`。仅 `isDemo` 会话走本规则。allowRoot = 副本根（cwd）。

| 工具 | 入参关键字段 | 裁决 |
|------|------------|------|
| `Write`/`Edit`/`MultiEdit` | `file_path` | `path.resolve(cwd, file_path)` 后 `startsWith(cwd)` → allow，否则 deny |
| `NotebookEdit` | `notebook_path` | 同上 |
| `Read`/`Glob`/`Grep` | 目标目录 | 限副本根内 → allow，否则 deny |
| `welfare_db` | `sql` | allow（仅作用 demo 库 + 后端表校验，见 §4） |
| `Bash`/`KillShell`/`WebFetch`/`WebSearch`/任意其它/未知 MCP | — | deny |

- **deny 返回**：`{ behavior: "deny", message: "演示模式仅允许在副本沙箱内操作福利签收模块" }`。
- **逃逸防护**：拒绝绝对路径、`..` 跳出副本根、符号链接跳出。

---

## 4. welfare_db 工具 / `POST /api/claude-chat/demo/sql`

demo agent 改数据的唯一通道，**绑定本会话的 demo SQLite 库**（绝不连 toolbox.db）。

**入参**
```json
{ "sessionId": "demo_xxx", "sql": "UPDATE welfare_sign_config SET detail_title = ? WHERE id = 1", "params": ["新标题"] }
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | 是 | 用于定位本会话的 `<sandboxId>.db`（后端按会话绑定，客户端不可指定任意路径） |
| sql | string | 是 | 单条 SQL，禁多语句 |
| params | array | 否 | 参数化占位值 |

**校验（后端权威，全过才执行）**
- 连接目标 = 本会话 demo 库（由 sessionId 映射，**不接受外部传库路径**）。
- SQL 引用的所有表名必须以 `welfare_sign_` 开头；禁多语句；禁 `ATTACH`/`PRAGMA`/`DETACH`；DDL 仅限 `welfare_sign_*` 对象。

**响应 200**
```json
{ "kind": "update", "affected": 1 }
```
或
```json
{ "kind": "query", "columns": ["id","name"], "rows": [[1,"张三"]], "rowCount": 1 }
```

**拒绝**：`{ "timestamp": "...", "status": 422, "error": "Unprocessable Entity", "message": "SQL 触碰了非福利签收表" }`（走 `GlobalExceptionHandler` 统一结构）。

---

## 5. 数据库迁移（claude_chat_session 增列）

| 列 | 类型 | 说明 |
|----|------|------|
| is_demo | INTEGER | 1=演示会话；旧行默认 0/NULL（迁移 bean 补列） |
| sandbox | TEXT | 副本句柄/标识（如 sandboxId）；正式会话 NULL |

> 走既有 `ClaudeChatSchemaMigration` 兜底补列，schema.sql 维持 `IF NOT EXISTS`。demo 库本身按 `welfare-sign-schema.sql` 建表，不进 claude-chat 迁移。
