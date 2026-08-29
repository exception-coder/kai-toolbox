# Codex App Server 接入加固编码摘要

## 1. 核心规则

- JSON-RPC 消息按 response、notification、server request 三类互斥处理。
- 非 MCP 工具监管只接受真实 App Server 事件作为进展。
- 工具超时只中断当前轮，不自动重放普通工具。
- 中断后 2.5 秒仍无终态时沿用现有强制清理；正常完成只关闭 stdin 并后台等待退出。
- MCP 专用恢复逻辑保持不变。
- 官方 Codex 运行中纯文本使用 `turn/steer`，附件与其它引擎继续排队。

---

## 2. 接口入口指针

新增浏览器 → Java WebSocket `steer { text, messageId }`，以及 Java → Sidecar `steer { sessionId, text }`。

---

## 3. 涉及类清单

| 全路径 | 操作 | 说明 |
|---|---|---|
| `sidecar/claude-agent/src/codexAppServer.ts` | 修改 | 消息分类、服务端请求失败关闭和工具监管 |
| `sidecar/claude-agent/src/toolExecutionWatchdog.ts` | 新增 | 非 MCP 工具空闲与总时长监管 |
| `sidecar/claude-agent/src/codexEngine.ts` | 修改 | 识别工具监管触发的系统中断 |
| `sidecar/claude-agent/src/sessionManager.ts` | 修改 | 复用现有权限裁决入口 |
| `sidecar/claude-agent/src/server.ts` | 修改 | 路由 Sidecar steer 命令 |
| `tools/tool-claude-chat/.../ClientMessage.java` | 修改 | 声明浏览器 steer 契约 |
| `tools/tool-claude-chat/.../ClaudeChatService.java` | 修改 | 校验运行态与官方 Codex 后转发 steer |
| `frontend/src/features/claude-chat/hooks/useClaudeChatSocket.ts` | 修改 | 乐观展示并发送 steer |
| `frontend/src/features/claude-chat/pages/ChatPage.tsx` | 修改 | 运行中纯文本选择 steer 或队列 |

### 关键方法签名与职责

```text
ToolExecutionWatchdog.observe(event): void — 消费统一工具事件并维护监管状态
ToolExecutionWatchdog.clear(): void — 释放全部计时器
classifyCodexAppServerMessage(message): response | notification | serverRequest | invalid — 防止双向消息误路由
resolveCodexAppServerRequest(message, options): Promise<JsonRpcResponse> — 支持的方法回包，未知方法显式失败
runCodexAppServerTurn(options): Promise<void> — 将监管超时转换为中断和失败终态
steerCodexAppServerTurn(sessionId, input): Promise<boolean> — 追加输入到活跃 turn
```

---

## 4. 数据结构

不新增数据库结构。监管条目仅驻留单轮内存：工具 ID、名称、类别、开始时间、最后真实活动时间、空闲阈值和总时长阈值。

---

## 5. 重要约束与边界

- `toolCallId` 幂等覆盖，收到结果后删除。
- `watchdogGenerated=true` 的事件不得刷新真实活动时间。
- Shell 和动态工具纳入监管；MCP、文件编辑和子智能体不纳入。
- 默认空闲阈值 5 分钟，总时长 60 分钟，最小允许值 5 秒。
- 未注册动态工具时收到 `item/tool/call` 返回不支持错误，不能假造成功。

---

## 6. 下游依赖调用

```text
Codex App Server turn/interrupt — 请求取消当前轮
Codex App Server item/completed — 工具权威终态
Codex App Server turn/completed — 回合权威终态
```

---

## 7. 异常处理要点

- 工具空闲或总时长超限 → 失败工具事件与 `TOOL_EXECUTION_TIMEOUT`，随后中断当前轮。
- 未支持服务端请求 → JSON-RPC `-32601`，保留方法名上下文。
- App Server 中断后无终态 → 强制关闭每轮子进程和未完成活动。
- 正常 `turn/completed` → 立即发布业务终态；后台等待自然退出，超时后才强制清理。
- steer 的 `expectedTurnId` 不匹配或没有活跃轮次 → 拒绝追加，不自动改发新轮。
