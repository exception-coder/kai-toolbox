# 企业内部多 Web 系统统一嵌入式 AI 助手 API 契约

## 快速导航

- [接口清单](#1-接口清单)
- [上下文快照](#2-上下文快照)
- [意图路由](#3-意图路由)
- [创建草稿](#4-创建草稿)
- [确认登记](#5-确认登记)
- [统一 WebSocket 协议](#6-统一-websocket-协议)
- [工程师候选](#7-工程师候选)
- [错误语义](#8-错误语义)
- [Widget 可见性与位置](#9-widget-可见性与位置)

## 1. 接口清单

| 方法 | 路径 | 用途 |
|---|---|---|
| WebSocket | `/api/claude-chat/consult/ws` | 统一创建、恢复、发送、排队和 Assistant 命令通道 |
| POST | `/api/assistant/intents/route` | 内部兼容接口：显式模式直达或 AUTO 意图分类 |
| POST | `/api/assistant/sessions/{id}/context` | 内部兼容接口：保存请求时上下文快照 |
| GET | `/api/assistant/sessions/{id}/context` | 查询会话上下文快照 |
| POST | `/api/assistant/drafts` | 内部兼容接口：创建 Bug 或建议草稿 |
| GET | `/api/assistant/drafts/{id}` | 查询草稿 |
| POST | `/api/assistant/drafts/{id}/confirm` | 内部兼容接口：幂等登记到 ReqPool |
| GET | `/api/auth/users/options` | 内部兼容接口：查询启用的工程师候选 |

外部宿主 SDK 只使用第一行统一 WebSocket；其余 HTTP 接口保留给 kai-toolbox 内部页面和兼容调用，不属于宿主接入必需契约。

## 2. 上下文快照

`POST` 与 `GET /api/assistant/sessions/{id}/context` 均需要登录且仅允许会话所有者访问。保存请求：

```json
{
  "protocolVersion": "1.0",
  "snapshot": {
    "application": {"appId": "KAI_TOOLBOX", "name": "kai-toolbox"},
    "page": {"url": "/reqpool", "title": "需求池"},
    "capturedAt": 1787040000000
  }
}
```

服务端返回包含 `id`、`sessionId`、`creatorUserId`、`protocolVersion`、`snapshotJson` 和 `createTime` 的持久化快照。单份 JSON 上限为 64000 字符；新增可选字段必须向后兼容。

## 3. 意图路由

`POST /api/assistant/intents/route`

```json
{"mode":"AUTO","text":"订单审核为什么一直转圈？"}
```

显式 `QUESTION`、`BUG`、`SUGGESTION`、`DIAGNOSE` 不调用分类模型；只有 `AUTO` 调用受控分类器。返回 `intent`、`confidence` 和 `reason`，模型超时或非法输出降级为 `UNKNOWN`。

## 4. 创建草稿

`POST /api/assistant/drafts`

```json
{
  "sessionId": "session-id",
  "kind": "BUG",
  "title": "订单审核持续转圈",
  "description": "点击审核后接口返回 500",
  "contextSnapshot": {},
  "evidence": []
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `sessionId` | string | 是 | 当前用户拥有的咨询会话 |
| `kind` | string | 是 | `BUG` 或 `SUGGESTION` |
| `title` | string | 是 | 草稿标题 |
| `description` | string | 是 | 可编辑描述 |
| `contextSnapshot` | object | 是 | 请求时不可变上下文 |
| `evidence` | array | 否 | 已脱敏的网络、JS 和轻量事件证据 |

成功返回 `201` 和草稿；草稿状态为 `DRAFT`。

## 5. 确认登记

`POST /api/assistant/drafts/{id}/confirm`

Headers：`Idempotency-Key` 必填，值为客户端持久化的草稿级 UUID。

```json
{
  "engineerUserId": 123
}
```

成功或重复提交均返回 `200`：

```json
{
  "draftId": "draft-id",
  "requirementId": "req-id",
  "status": "PENDING_EXECUTION",
  "alreadySaved": false
}
```

重复键返回首次记录，`alreadySaved` 为 `true`。

## 6. 统一 WebSocket 协议

沿用现有 `open`、`attach`、`send` 和带 `seq` 的服务端消息，不新增平行聊天端点。独立 SDK 只依赖本协议，不依赖 React Hook。

```json
{
  "type": "send",
  "sessionId": "session-id",
  "text": "为什么无法审核？",
  "assistant": {
    "protocolVersion": "1.0",
    "mode": "AUTO",
    "contextSnapshot": {}
  }
}
```

运行中、回复中、待确认或恢复未稳定时，客户端通过同一 WS 保存消息；服务端安全释放后按 FIFO 自动发送。

```json
{
  "type": "queue",
  "id": "client-message-uuid",
  "text": "继续检查订单审核日志",
  "displayText": "继续检查订单审核日志",
  "developerInstructions": "已脱敏的助手指令",
  "createdAt": 1787040000000
}
```

服务端接受后返回 `queueAccepted`；真正释放时继续返回既有 `queueDispatched`。相同 `id` 使用存储层 upsert，断线重试不得生成重复队列记录。

上下文、草稿、确认和工程师候选也复用同一连接，客户端用 `requestId` 关联连接级结果：

```json
{"type":"assistantContextSave","requestId":"uuid","sessionId":"session-id","protocolVersion":"1.0","contextSnapshot":{}}
{"type":"assistantDraftCreate","requestId":"uuid","sessionId":"session-id","kind":"BUG","title":"审核失败","description":"接口返回 500","contextSnapshot":{},"evidence":{}}
{"type":"assistantDraftConfirm","requestId":"uuid","draftId":"draft-id","idempotencyKey":"uuid","engineerUserId":123}
{"type":"assistantUsersList","requestId":"uuid"}
```

统一响应：

```json
{
  "type": "assistantCommandResult",
  "seq": 0,
  "requestId": "uuid",
  "action": "draftCreate",
  "success": true,
  "data": {"draftId": "draft-id", "status": "DRAFT"},
  "errorCode": null,
  "message": null
}
```

`assistantCommandResult` 为连接级响应，`seq` 固定为 `0`，不进入会话事件回放。确认登记的 `idempotencyKey` 由 SDK 按草稿持久化，断线或超时重试复用同一值。

独立 SDK 必须持久化 `sessionId`、最后确认 `seq` 和已展示消息。重连发送 `attach(sessionId,lastEventSeq)`；服务端按水位补拉，客户端按 `seq` 去重。

V0.1 认证由 WS 握手的 Assistant ACCESS token 完成。SDK 在每次建连时调用 `getAccessToken`，或读取显式配置的外部登录实例内存 Token，将结果作为 `access_token` 查询参数发送但不写入本地存储；推荐宿主通过同源反向代理接入并避免代理访问日志记录完整查询串。协议中的 `application.user` 仅为上下文，不得作为授权凭证。生产环境必须将 `consultAllowedOriginPatterns` 配为明确宿主域名，不得保留 `*`。

## 7. Forge 外部登录

宿主未提供 `getAccessToken` 且显式配置 `externalLogin.loginUrl` 时，Widget 展示 Forge 账号登录表单，并调用既有接口：

```http
POST /api/auth/external-login
Content-Type: application/json
Origin: https://erp-test.company.internal
```

```json
{"username":"forge-user","password":"user-input"}
```

SDK 只读取响应中的 `accessToken`、`expiresIn` 和 `user`；忽略且不保存 `refreshToken`。登录成功后立即建立咨询 WebSocket。登录失败保留用户名、清空密码并允许重试；页面刷新、SDK `destroy()` 或显式清除认证后需要重新登录。

服务端配置：

```yaml
toolbox:
  auth:
    external-login:
      enabled: true
      allowed-origins:
        - "https://erp-test.company.internal"
```

该接口复用 Forge 账号校验和权限解析，只返回 `accessToken`、`tokenType`、`expiresIn`，不签发 REFRESH Token。仅对 `/api/auth/external-login` 注册 `POST` 和 `OPTIONS` CORS；原 `/api/auth/login`、刷新、登出、用户管理和其他 Forge API 不允许跨域。白名单为空、功能关闭或 Origin 未命中时不返回允许跨域响应头。

## 8. 工程师候选

`GET /api/auth/users/options` 只返回启用账号的 `userId`、`username`、`realName`。确认登记时，非空 `engineerUserId` 必须仍是启用注册用户。

## 9. 错误语义

| 错误码 | HTTP 状态 | 场景 |
|---|---:|---|
| `AUTH_REQUIRED` | 401 | 未登录 |
| `SESSION_FORBIDDEN` | 403 | 访问他人会话 |
| `SESSION_NOT_FOUND` | 404 | 会话不存在 |
| `DRAFT_NOT_FOUND` | 404 | 草稿不存在 |
| `INVALID_IDEMPOTENCY_KEY` | 400 | 幂等键缺失或非法 |
| `INVALID_DRAFT_STATE` | 409 | 非草稿状态执行确认 |
| `PAYLOAD_TOO_LARGE` | 413 | 上下文或证据超过 64000 字符 |
| `TURN_BUSY` | WS Error | 当前回合仍在运行，客户端应改发 `queue` |
| `BAD_MESSAGE` | WS Error | 消息类型或字段无法解析，该条被忽略且连接保持 |

## 10. Widget 可见性与位置

宿主可通过初始化参数控制默认隐藏和拖动：

```ts
initializeAssistant({
  appId: 'ERP',
  wsUrl: '/assistant-ws',
  visibility: {
    initiallyHidden: true,
    activationKey: 'erp-assistant',
    shortcut: { key: '0', ctrlOrMeta: true, alt: true, shift: true },
  },
  draggable: true,
})
```

| 字段 | 缺省值 | 说明 |
|---|---|---|
| `visibility.initiallyHidden` | `false` | 首次加载时不展示入口和对话框 |
| `visibility.activationKey` | 空 | 非空时，快捷键唤起密钥输入；仅控制显示，不是认证凭据 |
| `visibility.shortcut` | `Ctrl/⌘ + Alt/Option + Shift + 0` | 使用无功能语义的低冲突数字组合；`ctrlOrMeta` 在 Windows/Linux 匹配 Ctrl，在 macOS 匹配 Command |
| `draggable` | `true` | 桌面端允许拖动入口和对话框；窄屏允许拖动胶囊，对话框保持固定全屏 |

拖动位置只保存坐标，不保存 `activationKey`；存储按 `appId + userId` 隔离。窗口尺寸变化后必须重新约束坐标，禁止把入口或对话框留在视口外。宿主调用 `assistant.open(...)` 时直接显示，不要求重复输入显示密钥。

## 11. 中止与调试日志

`AssistantSdk#interrupt()` 与 Widget 的“中止”按钮使用同一控制路径。上下文仍在准备时取消本地 Provider；已进入运行阶段时，Transport 发送：

```json
{ "type": "interrupt" }
```

Widget 状态可携带单条增量 `debugEntry`：

```json
{
  "id": "debug-id",
  "timestamp": 1787117332453,
  "category": "connection",
  "summary": "WebSocket 连接成功",
  "detail": { "restoringSession": true }
}
```

`category` 仅允许 `context`、`connection`、`send`、`receive`、`control`、`error`。调试日志最多保留 200 条，只存在 Widget 当前页面内存；发送与接收日志只能记录协议类型、水位、重连次数等安全元数据，禁止记录 WS 查询参数、Token、密码、Cookie、消息正文和上下文值。
