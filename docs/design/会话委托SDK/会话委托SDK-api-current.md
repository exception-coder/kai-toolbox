# 会话委托 SDK API

## 所有者控制面

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/claude-chat/sessions/{sessionId}/delegations` | 创建 Grant 和单次邀请 |
| GET | `/api/claude-chat/sessions/{sessionId}/delegations` | 列出授权与在线 Client 数 |
| POST | `/api/claude-chat/sessions/{sessionId}/delegations/{grantId}/pause` | 暂停并断开公共连接 |
| POST | `/api/claude-chat/sessions/{sessionId}/delegations/{grantId}/resume` | 恢复授权 |
| DELETE | `/api/claude-chat/sessions/{sessionId}/delegations/{grantId}` | 永久撤销并断开公共连接 |
| POST | `/api/claude-chat/sessions/{sessionId}/delegations/{grantId}/invitation` | 撤销旧邀请并重签 |
| GET | `/api/claude-chat/sessions/{sessionId}/delegations/{grantId}/audit` | 读取有界审计 |

控制面要求 Forge 登录，并由 ADMIN 或会话所有者调用。状态变更携带 `expectedVersion`。

## 参与者 REST

| Method | Path | 认证 | 说明 |
|---|---|---|---|
| POST | `/api/session-client/v1/invitations/exchange` | Forge JWT | 单次兑换 Grant token |
| GET | `/api/session-client/v1/session` | Grant Bearer | 公开会话与限制摘要 |
| GET | `/api/session-client/v1/messages` | Grant Bearer | user/assistant 投影历史 |
| POST | `/api/session-client/v1/attachments` | Grant Bearer | 上传附件并返回逻辑 ID |
| POST | `/api/session-client/v1/connections` | Grant Bearer | 签发 30 秒单次 WS ticket |

## 参与者 WebSocket

端点：`/api/session-client/v1/ws?ticket=...&protocolVersion=1.0`。

允许命令：`attach`、`send`、`answerQuestion`、`interruptOwnTurn`、`acknowledge`。除 `attach` 外，变更命令带 `commandId` 与 `expectedSessionVersion`。未知命令默认拒绝。

允许事件：`ready`、`message`、`commandAccepted`、`progress`、`businessQuestion`、`completed`、`blocked`、`replayGap`、`error`。未知内部事件默认丢弃；工具输入输出、路径、凭据、原生会话 ID、模型和供应商诊断不会投影。
