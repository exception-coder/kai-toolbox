# 福利签收演示 编码摘要

> 由 `福利签收演示-current.md` 精简而来，聚焦实现所需的最小必要信息。
> 接口/沙箱契约见 `福利签收演示-api-current.md`。包根：`com.exceptioncoder.toolbox.claudechat`（复用）；前端 `features/welfare-sign-demo`。

---

## 变更记录

| 版本 | 日期 | 变更内容摘要 |
|------|------|--------------|
| current | 2026-06-24 | 初始：副本沙箱模型，复用 claude-chat agent 链路 |

---

## 1. 核心业务规则

- 真实零影响：供给副本只读真实源码/真实表；运行期 agent 只读写副本目录 + demo 库；无回灌真实。
- 公开免登录：demo 页 showcase 不经 RouteGuard；demo WS 握手放行；不带 token。
- 服务端单一事实源：cwd（副本目录）/engine=claude/网关空/工具集由约束档固定，客户端 Open 参数丢弃。
- 写/读限副本：文件工具目标 `path.resolve(cwd,p)` 后必须 `startsWith(cwd=副本根)`，拒绝绝对路径与 `..` 逃逸。
- SQL 限 demo 库：`welfare_db` 绑本会话 `<sandboxId>.db`，表名 ⊆ `welfare_sign_*`，禁多语句/DDL 越界/ATTACH/PRAGMA。
- deny-by-default：Bash/命令/网络/任意 MCP/未知工具一律拒，无人工审批。
- 一次性：会话结束 / 超 `ttlMinutes` 删副本目录 + demo 库；启动清残留。
- 容量护栏：`maxConcurrentSandboxes` 上限；复制排除 `target/node_modules/dist`。
- 会话隔离：demo 会话 `isDemo=true`，不入正式 claude-chat 列表；正式通道行为不变。

---

## 2. 接口入口指针

> 字段级契约见 `福利签收演示-api-current.md`。

| 接口/通道 | 实现类 #方法 |
|------|-------------|
| WS `/api/claude-chat/demo/ws` | `DemoWebSocketHandler#afterConnectionEstablished` / `#handleTextMessage` |
| 供给副本 | `WelfareDemoSandboxProvisioner#provision` / `#dispose` |
| demo 建会话 | `ClaudeChatService#openSession`（demo 分支） |
| 受限 SQL | `WelfareDemoSqlService#exec` ；`POST /api/claude-chat/demo/sql`（退化方案） |
| 握手放行 | `AdminHandshakeInterceptor#beforeHandshake` |
| sidecar 裁决 | `permissions.ts canUseTool`（demo 分支）；`welfareDb.ts` |

---

## 3. 涉及类清单（全路径）

| 全路径 | 操作 | 说明 |
|--------|------|------|
| `com.exceptioncoder.toolbox.claudechat.config.DemoWebSocketHandler` | 新建 | 供给副本 + demo 建会话；丢弃客户端越权参数 |
| `com.exceptioncoder.toolbox.claudechat.config.WelfareDemoProperties` | 新建 | `toolbox.welfare-demo.*` 约束档 |
| `com.exceptioncoder.toolbox.claudechat.config.ClaudeChatWebSocketConfig` | 改 | 注册 `/demo/ws`，该路由不挂 AdminHandshakeInterceptor |
| `com.exceptioncoder.toolbox.claudechat.service.WelfareDemoSandboxProvisioner` | 新建 | 克隆源码 + 建/导 demo 库 + dispose + TTL 扫描 |
| `com.exceptioncoder.toolbox.claudechat.service.WelfareDemoSqlService` | 新建 | 在 demo 库执行受限 SQL（表白名单 + 禁多语句） |
| `com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService` | 改 | openSession demo 分支：cwd=副本/isDemo/sandbox 透传；会话关闭触发 dispose |
| `com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession` | 改 | 增 isDemo/sandbox 字段 + RowMapper/insert 兼容 |
| `com.exceptioncoder.toolbox.claudechat.config.ClaudeChatSchemaMigration` | 改 | 补列 is_demo/sandbox（迁移兜底） |
| `com.exceptioncoder.toolbox.common.auth.web.AdminHandshakeInterceptor` | 改 | demo WS 路径前缀跳过 ADMIN |
| `sidecar/claude-agent/src/permissions.ts` | 改 | canUseTool demo 沙箱裁决（deny-by-default + cwd 内 startsWith） |
| `sidecar/claude-agent/src/sessionManager.ts` | 改 | demo 会话 query options：cwd=副本、注入 welfare_db、isDemo 透传 |
| `sidecar/claude-agent/src/welfareDb.ts` | 新建 | welfare_db 工具 → 后端 SQL 通道 |
| `frontend/src/features/welfare-sign-demo/index.tsx` | 新建 | FeatureManifest（layout showcase） |
| `frontend/src/features/welfare-sign-demo/pages/WelfareDemoPage.tsx` | 新建 | 复用 claude-chat 对话组件 |
| `tools/tool-claude-chat/src/main/resources/db/claude-chat-schema.sql` | 改 | is_demo/sandbox 列（IF NOT EXISTS / 迁移兜底） |

### 关键方法签名与职责

```
WelfareDemoSandboxProvisioner#provision(String sessionId): Sandbox
  — 在 sandboxRoot/<sandboxId> 复制 sourcePaths（排除 copyExcludes）；建 <sandboxId>.db 按 welfare-sign-schema 建表并从真实 welfare_sign_* 导数据；登记句柄
WelfareDemoSandboxProvisioner#dispose(String sandboxId): void — 删目录 + db；幂等
WelfareDemoSandboxProvisioner#sweepExpired(): void — @Scheduled / 启动调用，回收超 ttl 与残留
WelfareDemoSandboxProvisioner.Sandbox(record) — { sandboxId, dir(Path), demoDbPath(Path) }

WelfareDemoSqlService#exec(String sessionId, String sql, List<Object> params): SqlResult
  — 由 sessionId 解析本会话 demo 库；校验表 ⊆ welfare_sign_* + 单语句 + 黑名单关键字；执行返回 {kind,affected|columns/rows}

ClaudeChatService#openDemoSession(ws, sandbox): void
  — 以 sandbox.dir() 为 cwd、isDemo=true、engine=claude、网关空，调 sidecar.startSession + 落库标记

AdminHandshakeInterceptor#beforeHandshake — uri.path startsWith "/api/claude-chat/demo/ws" → return true（放行）
```

```
// sidecar permissions.ts（demo 分支伪代码）
canUseTool(toolName, input, opts):
  if (!session.isDemo) -> 原逻辑
  const cwd = session.cwd
  switch toolName:
    Write/Edit/MultiEdit/NotebookEdit: return within(cwd, input.file_path ?? input.notebook_path) ? allow : deny
    Read/Glob/Grep: return within(cwd, target) ? allow : deny
    welfare_db: return allow
    default: return deny("演示模式仅允许在副本沙箱内操作福利签收模块")
within(root, p): const abs = path.resolve(root, p); return abs === root || abs.startsWith(root + path.sep)
```

---

## 4. 数据结构

```
临时副本：${data-dir}/welfare-demo/<sandboxId>/  （源码克隆，销毁即删）
临时 demo 库：${data-dir}/welfare-demo/<sandboxId>.db  （welfare_sign_* schema + 数据快照）
claude_chat_session 增列：is_demo INTEGER, sandbox TEXT （迁移兜底，旧行默认 0/NULL）
```

WelfareDemoProperties（`toolbox.welfare-demo.*`）：enabled / sourcePaths / sandboxRoot / allowedTablePrefix / ttlMinutes / maxConcurrentSandboxes / copyExcludes。

---

## 5. 重要约束与边界

- demo 库连接句柄硬绑 sessionId→demoDbPath 映射，**不接受外部传库路径**；后端绝不把 toolbox.db 路径暴露给 demo 通道。
- 复制不跟随符号链接；排除 target/node_modules/dist；单副本与并发数有上限。
- 会话关闭（WS close）与 TTL 双触发 dispose；启动 sweep 清残留目录。
- sidecar 与后端各一层校验（路径在 sidecar、表名+库绑定在后端）。
- 不处理：回灌真实、跑命令/编译、切引擎、第三方网关、多 IP 限流（v2）。

---

## 6. 下游依赖调用

```
复用：SidecarClient（startSession/userMessage/interrupt）、ClaudeChatService 事件分发、useClaudeChatSocket（前端）
新增：sidecar welfare_db → 后端 WelfareDemoSqlService（MCP 优先 / 127.0.0.1 HTTP 退化）
JDBC：WelfareDemoSqlService 用独立 DataSource/连接指向 <sandboxId>.db（不复用主 JdbcTemplate）
```

---

## 7. 异常处理要点

- 越界路径 / Bash / 网络 → sidecar canUseTool deny（带中文 message）。
- SQL 越界（非 welfare_sign_* / 多语句 / DDL 越界）→ 422，不执行。
- 并发副本超上限 → 建会话拒绝，前端提示「演示繁忙，稍后再试」。
- 供给失败（复制/导数据异常）→ 清理半成品副本 + 关会话 + error 事件。
- 鉴权开/关两态：demo 路径恒免鉴权且约束生效。
