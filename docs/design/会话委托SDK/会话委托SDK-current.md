# 会话委托 SDK

## 目标

将一条既有 Vibe Coding 会话安全委托给指定 Forge 用户。业务参与者通过独立 Client 查看同一会话、补充需求、上传附件、回答业务问题并观察 OpenSpec 自动监督进度；会话所有者保留暂停、撤销、接管和风险工具审批权。

## 边界

- 一个 Session Access Grant 只绑定一个 `sessionId`、一个参与者和一个服务端能力画像。
- 公共 Client 不复用 `/api/claude-chat/ws` 管理协议，只使用 `/api/session-client/v1`。
- 长期 grant token 只进入 `Authorization` 请求头；WebSocket URL 只携带 30 秒单次 ticket。
- Spring 网关校验身份、Grant、版本、配额、幂等键、命令白名单和事件投影。
- Sidecar 在每个参与者回合临时启用 `delegated-development`，忽略原会话的 bypass/auto-approve；只读工具可自动执行，风险工具仍向 Forge 所有者请求批准。
- 首版受约束执行只开放 Claude Code 和 Codex；其他引擎在公共发送门禁处拒绝。

## 运行链路

```text
Owner 创建 Grant → Participant 登录 Forge → 单次邀请码兑换
        ↓
grant-scoped token → 30 秒连接 ticket → 公共 WebSocket
        ↓
白名单命令 → Session Client command service → canonical Vibe session
        ↓
per-turn delegated-development → Sidecar / Agent
        ↓
allow-list event projector → SDK watermark/reconnect → Participant UI
```

## Server 设计

Server 保留一条 canonical Vibe Session，不为参与者复制 Agent 会话。所有者控制面管理 `SessionAccessGrant`；公共 REST 数据面只返回会话摘要、脱敏历史、附件和单次 ticket；公共 WebSocket 实时面只接收白名单命令并输出白名单事件。

Spring 网关负责参与者、Grant、会话绑定、Origin、配额、命令幂等和事件投影；Sidecar 再用 `delegated-development` 策略裁决 Agent 可用工具。因此即使业务输入包含 Prompt Injection，也不能改变工作区、引擎、权限模式或风险工具审批归属。

OpenSpec 自动监督使用同一会话的进度投影，Client 只看到阶段、task 和完成/阻塞结果，不看到原始 Tool Call、本机路径或凭据。详细端点契约以 `openspec/changes/delegated-session-client-sdk/specs/` 为单一事实源。

## 用户入口

- 所有者：Vibe Coding 当前会话的“委托”页签。
- 参与者：`/session-client`。
- SDK 构建：在 `frontend` 执行 `npm run session-client:build`，产物位于 `dist-session-client/`。

## Client 快速接入

业务用户可直接打开 `/session-client?invitation=<one-time-code>`；参考 Client 会自动兑换邀请、建立连接并恢复历史。

自定义 Web 应用在 `frontend` 执行 `npm run session-client:build`，安装 `dist-session-client/` 后使用：

```ts
import { createSessionClient } from '@kai/session-client'

const client = createSessionClient({
  requestBaseUrl: 'https://forge.company.internal',
  getAccessToken: () => grantScopedAccessToken,
})

client.subscribe(event => render(event))
client.subscribeState(state => renderConnection(state))
await client.connect()
await client.send({ text: '请继续完成当前 OpenSpec 任务' })
```

`grantScopedAccessToken` 来自已登录 Forge 上下文对一次性邀请的兑换。SDK 不接管 Forge 登录，不应将长期 token 放入 URL 或 localStorage。完整时序和错误恢复见 OpenSpec change 的 `Client Quick Start`。

## 网络配置

同源访问默认允许。跨机器访问应由既有 VPN、企业 HTTPS 入口或受控隧道提供，并设置：

```text
FORGE_SESSION_CLIENT_ALLOWED_ORIGINS=https://business.example.internal
```

远程 Origin 必须是 HTTPS；`localhost`、`127.0.0.1` 和 `::1` 可使用 HTTP 开发。

## 数据与审计

SQLite 保存 Grant、单次邀请摘要、单次 ticket 摘要、命令回执和不含消息正文的审计元数据。原始邀请码与 ticket 只在签发响应中展示一次，不落库。Schema 由模块启动初始化器幂等创建。
