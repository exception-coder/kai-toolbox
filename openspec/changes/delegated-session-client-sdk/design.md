## Quick Navigation

- **理解边界** → [Context](#context) / [Goals / Non-Goals](#goals--non-goals)
- **实现方案** → [Decisions](#decisions) / [Server Design](#server-design) / [Public Contract Sketch](#public-contract-sketch)
- **Client 接入** → [Client Quick Start](#client-quick-start)
- **交付控制** → [Risks / Trade-offs](#risks--trade-offs) / [Migration Plan](#migration-plan) / [Verification Strategy](#verification-strategy)
- **待确认项** → [Open Questions](#open-questions)

## Context

Forge 现有 Vibe Coding 链路由 React 管理端、Spring WebSocket 网关、`ClaudeChatService`、Sidecar `SessionManager` 和具体 Agent 引擎组成。`useClaudeChatSocket.ts` 已处理事件水位和恢复；`ClientMessage.java` 同时承载普通发送与管理命令；`SessionExecutionPolicy.java` 根据入口决定执行域；`permissions.ts` 在 Sidecar 对工具调用作最终裁决。现有 `frontend/src/assistant-sdk` 已发布 ESM/IIFE/类型产物，但产品语义是业务咨询、页面上下文和需求登记，不是开发会话委托。

参与者是业务用户、会话所有者/开发人员和 Forge 管理员。业务用户输入必须视为不可信内容，不能因此获得服务端路径、凭据、原始工具参数或执行策略修改能力。Forge 仍运行在开发人员机器；跨机器访问必须经过企业 HTTPS 入口、VPN 或受控隧道。

## Goals / Non-Goals

**Goals:**

- 将一个既有或新建的 Vibe Coding 会话安全委托给指定业务参与者。
- 用服务端不可放宽的能力画像约束工作目录、执行权限、有效期和用户可发命令。
- 对外提供稳定、版本化、可恢复的 SDK 协议，不泄漏管理端内部协议。
- 让业务用户查看对话、附件、当前阶段、自动监督状态和最终结果，让开发人员随时暂停、撤销或接管。
- 复用现有 Session、Sidecar、附件、历史和自动监督实现。

**Non-Goals:**

- 不把 Forge 变成多租户云 IDE，不允许 Client 浏览任意项目或创建任意工作目录。
- 不向外部 Client 暴露终端、原始 Tool Call、模型/供应商切换、`bypassPermissions` 或自动审批开关。
- 不在本变更内提供公网穿透、企业 OIDC 服务或原生桌面应用。
- 不合并现有 Assistant SDK 与 Session Client SDK 的领域模型。

## Decisions

### Separate the public protocol from the admin protocol

新增 `/api/session-client/v1` 控制面和 `/api/session-client/v1/ws` 数据面。公共协议使用独立的 `SessionClientCommand`/`SessionClientEvent`，服务端只映射白名单命令到既有会话应用服务，绝不反序列化为管理端 `ClientMessage`。

首版 Client 命令限定为：`attach`、`send`、`answerQuestion`、`interruptOwnTurn` 和 `acknowledge`。模型、引擎、Provider、权限模式、自动审批、分叉、切换会话、刷新能力目录和工具审批均只留在 Forge 管理端。

替代方案是复用 `/api/claude-chat/ws` 并在 Handler 内拒绝危险消息；这会让新增内部消息默认进入公共攻击面，容易出现遗漏，因此不采用。

### Model delegation as a server-side aggregate

`SessionAccessGrant` 保存 `grantId`、`sessionId`、`subjectUserId`、`profileId`、`status`、`expiresAt`、`maxTurns`、`maxInputBytes`、`createdBy`、版本和审计时间。Client 只能读有效画像，不能提交或覆盖其中任何字段。

`SessionCapabilityProfile` 首版作为服务端有限枚举与结构化快照，而不是自由 JSON：

- `participantCommands`: 固定公共命令集合；
- `workspace`: 从绑定会话读取并锁定，Client 不接收绝对路径；
- `executionPolicy`: `delegated-development`；
- `toolBoundary`: 由会话所有者创建委托时选择的受支持档位；
- `approvalOwner`: 风险工具只向 Forge 管理端请求批准；业务参与者只能回答 Agent 的业务问题；
- `limits`: 有效期、轮数、单消息/附件上限和并发回合数。

替代方案是把 scopes 放进 Client 请求或 Prompt；前者可被篡改，后者不是安全边界，因此不采用。

### Keep two enforcement layers

第一层在 Spring 公共网关验证身份、Grant、会话绑定、命令白名单、配额、消息大小、幂等键和事件投影。第二层在 Sidecar 增加 `delegated-development` Tool Policy，即使网关遗漏字段或 Prompt 被注入，也不能切换执行域或调用画像外工具。

业务参与者看到的是投影事件：用户/助手文本、脱敏附件、队列状态、阶段、进度、业务问题、完成/失败/阻塞。原始工具输入输出、服务器路径、环境变量、Token、模型诊断和内部开发指令只在管理端可见。

### Use a grant token for REST and a one-time ticket for WebSocket

用户先以 Forge 身份登录，再用短时、单次邀请码兑换只绑定一个 `grantId + sessionId + subject` 的访问令牌。REST 使用 `Authorization: Bearer`；SDK 随后调用 `POST /api/session-client/v1/connections` 换取 30 秒、单次消费的 WebSocket ticket。浏览器只把 ticket 放入 WS URL，长期令牌不进入 URL、代理日志或浏览历史。服务端同时校验精确 Origin，并只允许 WSS/HTTPS 的远程部署。

令牌至少包含 `aud=session-client`、`sub`、`grantId`、`sessionId`、到期时间和唯一 ID；服务端每次操作仍查 Grant 状态，以支持即时撤销。后续具备企业认证条件时可改为授权码 + PKCE，并按 OAuth 2.0 BCP 增加发送方约束。

替代方案是在 WebSocket 查询参数直接传 Forge Access Token；RFC 6750 明确指出 URL Token 容易进入日志，不采用。

### Preserve one canonical session with projected multi-client events

委托不会复制 Agent 会话。管理端和业务 Client 连接同一逻辑 `sessionId`，但使用不同投影和命令集。每个事件含 `protocolVersion`、`eventId`、单调 `seq`、`sessionVersion` 和 `occurredAt`；重连携带最后确认的 `seq`，服务端回放或返回明确 `replayGap` 后由 SDK 走分页历史恢复。

发送命令必须带 `commandId` 幂等键和 `expectedSessionVersion`。同一会话只允许一个活跃 Agent 回合；运行中消息进入既有服务端队列。会话所有者的暂停、撤销和接管优先于参与者命令。

### Publish a separate framework-agnostic SDK and reference client

新增独立包 `@kai/session-client`，核心不依赖 React，暴露 `connect`、`send`、`answerQuestion`、`interrupt`、`loadHistory`、`subscribe` 和 `destroy`。SDK 负责协议版本、票据换取、指数退避、事件去重、幂等发送和可恢复错误，不包含 UI。

参考 Client 使用现有 React/Tailwind 体系，作为移动端友好的独立路由；展示会话标题、约束摘要、对话、附件、运行阶段、自动监督状态、连接恢复和授权到期。视觉遵循现有 Quiet Luxury 规范，错误状态必须提供重试、重新登录或联系所有者等恢复动作。

替代方案是扩展现有 Assistant Widget；两者的用户目标、上下文采集和权限模型不同，强行合并会形成庞大条件分支，因此只复用底层算法和测试样例。

### Keep application/domain boundaries explicit

- Presentation：公共 Controller/WS Handler、SDK 和参考 Client；
- Application：Grant 管理、邀请兑换、连接票据、命令派发、事件投影；
- Domain：Grant 生命周期、能力画像、配额和撤销规则；
- Infrastructure：SQLite Repository、Token/Ticket 加密签名适配器、既有会话网关。

公共网关通过窄接口调用现有 `ClaudeChatService` 能力，避免继续扩张其协议分发职责。Assistant SDK 与 Session Client SDK 只通过各自 `public-api` 对外暴露。

## Server Design

Server 不新建第二套 Agent 会话，而是在现有 canonical Vibe Session 之外增加一条受约束的公共边界：

```text
所有者控制面
  SessionDelegationController
           ↓ create / pause / resume / revoke / audit
  SessionAccessGrant + capability profile
           │
           ├── 参与者 REST 数据面 → SessionClientController
           │       ├── 会话摘要、投影历史、附件
           │       └── 30 秒单次 WebSocket ticket
           │
           └── 参与者实时面 → SessionClientWebSocketHandler
                   ├── 命令白名单、幂等回执、版本冲突
                   ├── 公共事件投影、水位回放、replay gap
                   └── canonical Vibe Session
                              ↓
                      Sidecar delegated-development policy
                              ↓
                      Agent + OpenSpec continuous runner
```

四个面各自只承担一类职责：

- **控制面**：由 Forge 所有者创建和撤销 Grant，能力画像、工作区和审批归属由服务端锁定。
- **REST 数据面**：只暴露参与者可见的会话摘要、消息投影、附件和单次连接 ticket。
- **WebSocket 实时面**：只接受 `attach`、`send`、`answerQuestion`、`interruptOwnTurn`、`acknowledge`；未知命令默认拒绝。
- **执行与证据面**：Sidecar 再应用一次不可放宽的工具策略；OpenSpec 自动监督进度通过公共事件投影给 Client，不暴露原始 Tool Call。

该分层形成两层硬边界：Spring 网关决定“这个人能对这个会话发什么命令”，Sidecar 决定“Agent 最终能执行什么工具”。Prompt 只负责任务语义，不承担权限边界。

## Public Contract Sketch

```text
Forge owner UI
  └─ create/revoke grant ──> Session Delegation application service
                                  │
Business Web Client ──> @kai/session-client ──> /api/session-client/v1
                                  │               ├─ Grant / limits / projection
                                  │               └─ one-time WS ticket
                                  ▼
                         canonical Vibe Session
                                  │
                         Sidecar tool policy
                                  │
                           Agent + Forge tools
```

核心 HTTP 资源：

- `POST /api/session-client/v1/invitations/exchange`
- `GET /api/session-client/v1/session`
- `GET /api/session-client/v1/messages?before=&limit=`
- `POST /api/session-client/v1/attachments`
- `POST /api/session-client/v1/connections`
- 管理端 `POST/GET/DELETE /api/claude-chat/sessions/{sessionId}/delegations...`

SDK 初始化草案：

```ts
const client = createSessionClient({
  requestBaseUrl: 'https://forge.company.internal',
  getAccessToken: () => sessionGrantToken,
})

const session = await client.connect()
session.subscribe(event => render(event))
await session.send({ text: '报价单还需要增加导出 Excel', attachments: [] })
```

## Client Quick Start

### Zero-code reference Client

1. 所有者在 Vibe Coding 会话的“委托”面板创建 Grant，选择 `REQUEST_ONLY` 或 `DELEGATED_DEVELOPMENT`。
2. 将一次性邀请码发给已登录 Forge 的参与者。
3. 参与者打开 `/session-client?invitation=<one-time-code>`，点击“验证并连接”。

参考 Client 会自动完成邀请兑换、ticket 签发、WebSocket 续接、历史补拉和 OpenSpec 进度展示。邀请码单次消费，不应在聊天或日志中长期保存。

### Custom TypeScript Client

在 Forge 的 `frontend` 目录生成独立产物：

```powershell
npm run session-client:build
```

将 `dist-session-client/` 发布到内部 npm 仓库，或在开发期作为 `file:` 依赖安装：

```powershell
npm install file:../kai-toolbox/frontend/dist-session-client
```

宿主应用先在已登录 Forge 上下文中兑换一次性邀请；SDK 只接收兑换后的 grant-scoped token，不接管 Forge 登录：

```ts
import { createSessionClient } from '@kai/session-client'

const exchange = await fetch(
  'https://forge.company.internal/api/session-client/v1/invitations/exchange',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${forgeLoginToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invitationCode }),
  },
)
if (!exchange.ok) throw new Error('Session invitation exchange failed')
const { accessToken } = await exchange.json() as { accessToken: string }

const client = createSessionClient({
  requestBaseUrl: 'https://forge.company.internal',
  getAccessToken: () => accessToken,
})

const stopState = client.subscribeState(state => renderConnectionState(state))
const stopEvents = client.subscribe(event => renderSessionEvent(event))
await client.connect()
await client.send({ text: '请继续完成当前 OpenSpec 任务' })

stopState()
stopEvents()
client.destroy()
```

跨机接入前还需要开启公共入口、配置精确 Origin，并由企业 HTTPS/WSS 入口将 HTTP 和 WebSocket 路由到同一 Forge Server：

```text
FORGE_SESSION_CLIENT_ENABLED=true
FORGE_SESSION_CLIENT_ALLOWED_ORIGINS=https://business.example.internal
```

不要把 grant token 放在 URL、localStorage 或服务器访问日志中。对授权过期或撤销返回的 `terminal` 状态不做无限重连；`offline` 才进入有界退避。

## Risks / Trade-offs

- [业务消息可构成 Prompt Injection] → 一律视为不可信输入；系统指令和执行画像由服务端注入，Sidecar 再做工具硬裁决，输出经过投影脱敏。
- [开发人员本机不可达或休眠] → Client 显示明确离线/等待所有者状态；网络入口由现有 HTTPS/VPN/受控隧道负责，不承诺云端高可用。
- [同一会话多端并发写入导致顺序不确定] → 单活跃回合、服务端队列、`commandId` 幂等和 `expectedSessionVersion` 冲突响应。
- [撤销后已有 WS 仍存活] → Grant 版本变更主动关闭相关连接，且每次命令再次检查状态。
- [公共事件误泄漏工具数据] → 使用显式 allow-list projector 和泄密回归测试；未知内部事件默认丢弃而非透传。
- [新 SDK 与 Assistant SDK 重复连接代码] → 先复制小型无领域依赖算法，稳定后再提取内部 transport 基础库，避免现在过早抽象。
- [现有工作树改动较多] → 新增文件和窄接口优先；涉及现有协议文件时逐块比对，禁止覆盖其它 OpenSpec 变更。

## Migration Plan

1. 先落地 Domain、SQLite schema 和应用服务，默认关闭公共委托入口。
2. 增加管理端委托创建/撤销 API 和 UI，只允许 ADMIN/会话所有者操作。
3. 增加公共 REST、一次性 WS ticket、事件投影及 Sidecar 双层策略，完成安全和重连测试。
4. 发布独立 TypeScript SDK，再接入参考 Client；在同机和企业 HTTPS 入口各做一次端到端验收。
5. 小范围启用一个测试项目和一个业务账号，观察审计、撤销、离线恢复与资源用量后再扩大。

回滚时先关闭公共入口并撤销所有 Grant，再移除参考 Client/SDK 发布指针；保留新增表和审计数据不影响现有 Vibe Coding 与 Assistant SDK。所有 schema 使用幂等 `CREATE TABLE/INDEX IF NOT EXISTS`。

## Verification Strategy

- Domain 单元测试覆盖邀请单次消费、到期、撤销、Subject/Session 不匹配、配额和乐观锁。
- Controller/WS 测试覆盖角色、Origin、票据单次消费、未知命令默认拒绝和连接撤销。
- Sidecar 测试证明 Client 无法通过 Prompt 或协议切换权限、引擎、Provider 或调用画像外工具。
- 投影测试使用含路径、环境变量、Token 和 Tool 参数的事件，证明公共事件不泄漏。
- SDK 测试覆盖 ACK 丢失、重复事件、乱序、断线回放、`replayGap`、过期和撤销。
- 运行前端类型检查/构建、Sidecar 测试、后端模块测试和 `forge-quality.ps1 verify`；只报告实际执行的检查器。

## Open Questions

- 第一批使用者是否都已有 Forge 账号；若没有，需要在启用前确定企业身份映射，不能用长期匿名链接替代。
- 首个试点会话的工具档位是“只提交需求等待开发人员执行”还是“允许 Agent 在固定项目内写代码但风险操作由所有者审批”。设计支持两者，首版默认后者。
