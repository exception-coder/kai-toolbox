# Forge Consult Client

`@kai/forge-consult-client@0.1.0` 面向项目组的业务咨询 SDK。无 React、无运行时第三方依赖，支持浏览器与 Node.js 22+，提供 ESM 和 TypeScript 声明。

**源码与包已提供，不代表服务已启用或真实账号联调通过。** 必须同时加载本次 Forge 服务端版本。SDK 不兼容旧 Widget 的内部聊天协议，也不兼容已移除源码的历史 `@kai/session-client` delegation 协议。

## 安装

当前提供本地 tarball，尚未发布公共 npm：

```powershell
npm install ./kai-forge-consult-client-0.1.0.tgz
```

源码构建与打包：

```powershell
Set-Location sdk/forge-consult-client
npm ci
npm test
npm pack
```

请交付完整 tarball，不单独拷贝 dist/client.js；包内包含声明、运行代码、说明和示例。

## Forge 服务端准备

管理员在已有配置流程中设置以下开关，**修改配置后加载版本须另外获得重启授权**：

```yaml
toolbox:
  auth:
    enabled: true
    external-login:
      enabled: true
      allowed-origins:
        - https://your-business-app.example.com
  claude-chat:
    consult-client:
      enabled: true
    ws:
      consult-allowed-origin-patterns:
        - https://your-business-app.example.com
```

域名是占位示例，替换为真实完整 Origin；不能填 `*`。同源浏览器也需要与实际代理部署核对 Origin。Node.js 服务调用没有浏览器 Origin，但仍必须使用真实用户凭据。反向代理/隧道应转发 WebSocket Upgrade，支持长连接与心跳；不要开放 Sidecar 或开发管理端口。

如果部署额外配置了覆盖全部 API 的 JWT protected-patterns，握手路由 `/api/fore-consult/client/ws` 需采用本协议的首帧认证，不能被要求携带 URL Access Token；由管理员核对并精确配置该路由的过滤范围，不能放开其他接口。

部署需要现有咨询候选系统、默认 AI 账号、可用源码与资源授权。缺少配置时服务端明确拒绝，不由 SDK 绕过。新增请求表由应用启动自动创建；**DDL 未核验**：新表 `consult_client_request` 未出现在既有知识基线，字段由本次模块 schema 定义，不是已核验的运行库结构；无需手工执行数据库脚本。

## 身份

`getAccessToken` 返回**实际调用用户**的 Forge Access Token。已有受控 `/api/auth/external-login` 可以在开启后签发短期 token，不返回 Refresh Token。SDK 不储存密码、不自动切换用户、不读取浏览器其他账号。

- 后台/脚本从服务器凭据管理获得授权，禁止把共享 token 写入仓库或浏览器。
- 网页由宿主完成当前员工的 Forge 授权，再通过回调供 SDK 使用。
- 当前版本不签发应用 API Key，不支持任意 userId 代理；没有用户授权时应先完成登录接入。
- 共用 AI 运行账号不意味着共用咨询访问权。外部接口即使管理员也只允许操作本人咨询。

## 发问与流式回答

```ts
import { ForgeConsultClient } from '@kai/forge-consult-client'

const client = new ForgeConsultClient({
  baseUrl: 'https://your-forge.example.com',
  getAccessToken: () => currentUserForgeAccessToken(),
  onCheckpoint: checkpoint => saveForCurrentUser(checkpoint),
})

const unsubscribe = client.on(event => {
  if (event.type === 'answer.delta') appendToCurrentAnswer(event.text ?? '')
  if (event.type === 'answer.snapshot') replaceCurrentAnswer(event.text ?? '')
  if (event.type === 'completed') showActualStopReason(event.stopReason)
  if (event.type === 'error') showRecoverableError(event.code, event.message)
  if (event.type === 'history') renderPersistedHistory(event.items ?? [])
})

// 在宿主存储中先保存 requestId 和完整输入，超时重试使用相同 ID、问题和附件列表。
const input = { requestId: crypto.randomUUID(), question: '这张采购订单为什么不能审核？' }
savePendingInput(input)
const receipt = await client.ask(input)
// receipt 是登记回执，不能显示为“回答成功”。
saveConsultationId(receipt.consultationId)
```

以上宿主函数是接入占位函数，按项目实现；SDK 不提供 UI。可运行 Node 示例见 [examples/node.mjs](examples/node.mjs)，浏览器工厂见 [examples/browser.ts](examples/browser.ts)。

Python 项目可参考 [examples/python.py](examples/python.py) 对接相同协议（Python 3.11+，按项目锁定 `websockets` 依赖）。它是协议示例，不是独立 Python SDK；本次仅作语法检查，真实网络与账号效果待联调。

同一 client 默认继续已绑定咨询；新咨询创建另一个 client，避免迟到事件串流。

```ts
await client.ask({ requestId: crypto.randomUUID(), question: '按刚才修正的条件继续' })
```

服务端使用与平台页面相同的系统定位与调度，AI 账号在每轮执行时读取最新默认配置。已归档咨询只能读取；延续为新咨询当前通过平台操作，SDK 不强行解除归档。当前轮进行中返回 TURN_BUSY，一期不隐式排队。

## 图片和附件

首张图片须先预留咨询身份，然后上传，再发问；预留不会调用 AI 回答：

```ts
await client.create({ requestId: crypto.randomUUID(), question: '请分析截图中的审核问题' })
const file = await client.upload(imageBlob, 'screen.png')
await client.ask({ requestId: crypto.randomUUID(), question: '请分析截图中的审核问题', attachmentIds: [file.id] })
```

每条最多 5 个附件；SDK 单文件上限 10MB，最终仍受服务器类型、大小及授权校验。只发送不透明附件 ID，不填写磁盘路径、URL 或其他咨询的附件 ID。生成文件下载暂沿用平台授权入口，本版不输出内部路径或承诺通用文档下载 API。

## 恢复与取消

```ts
const restored = new ForgeConsultClient({
  baseUrl: 'https://your-forge.example.com', getAccessToken: () => currentUserForgeAccessToken(),
  checkpoint: loadForCurrentUser(),
})
restored.on(handleEvent)
await restored.connect()
const page = await restored.history()
if (page.nextBefore !== null) await restored.history(page.nextBefore)
await restored.cancel() // 仅发出中断请求，等待实际终态
restored.close()        // 只关闭观察连接，不代表取消 AI 轮次
```

检查点不含凭据，宿主仍须按用户隔离，退出时清理。ready 后 SDK 自动读取最近历史；更早记录按 nextBefore 分页。historyGap 非空要向用户说明缺口，不能宣称完整恢复。

连接认证超时有界、指数退避最多 5 次（可设 0–10），20 秒心跳；过期/撤销/策略拒绝后停止自动重连。重新登录后新建 client 并传原检查点。重连只发 resume，**不会重发业务问题**。若在首个 accepted 前断线而没有咨询 ID，保留原输入，人工重试相同 requestId，由服务器返回已登记咨询；不要换一个 ID 盲目重试。

## 事件与错误

| 事件 | 含义 |
|---|---|
| authenticated | 一次性连接票据已验证 |
| consult.created | 咨询已预留，尚未发送问题 |
| accepted | 业务请求已登记，尚不代表模型执行成功 |
| consult.ready | 当前会话状态/epoch；需要同步持久历史 |
| send.accepted | 既有聊天执行器的发送回执 |
| answer.delta / answer.snapshot | 当前回答块的增量/完整快照，快照替换当前块 |
| completed | 本轮收尾；须检查 stopReason，不能把所有终态当成功 |
| error / status | 错误或状态变化，保留原输入和咨询上下文 |
| history / connection | SDK 本地派发的历史和连接状态 |

`SEND_STATUS_UNKNOWN` 表示已发送情况不确定；`HTTP_401/403` 需要重新核对身份或范围；`HTTP_503` 可能是接入开关关闭。协议错误不暴露内部堆栈、账号和工具原文。未确认发送不能自动重发；连接关闭也不代表执行结束。

`PLATFORM_ACTION_REQUIRED` 表示原咨询在等待补充信息或平台操作；在平台原入口处理后恢复观察。SDK 不提供工具审批、权限放行或内部交互决策接口。回答事件的 requestId 仅在运行记录可核实时提供，不根据最近一次点击推测；同一咨询仍可能由平台其他页面继续操作。

## 接口与限制

- `POST /api/fore-consult/client/tickets`：Bearer 身份换 30 秒单次票据。
- `WSS /api/fore-consult/client/ws`：首帧 auth；只接受 consult.create/ask/resume/cancel 与 ping。
- `GET /api/fore-consult/client/sessions/{id}/messages`：授权持久历史分页。
- `POST /api/fore-consult/client/sessions/{id}/attachments`：multipart/file，返回不透明附件信息。

原 Widget 仍使用旧通道，不需迁移。本版适配器不接受系统指令、AI 账号、模型、源码路径、网关或授权模式；不公开工具调用日志。已保存历史与模型实际接续效果需要分别验收。

## 项目组验收

至少验证：本人新问/追问、平台可见同一咨询、另一个用户访问被拒、原附件可读、重复 requestId 不重复执行、断线/服务重启恢复、账号默认值切换、归档只读、Origin/TLS/代理超时及凭据撤销。SDK mock 测试或 tarball 导入成功不代表以上真实业务验收已经通过。

协议依据：[OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)、[Spring WebSocket API](https://docs.spring.io/spring-framework/reference/6.2/web/websocket/server.html)、[Node.js WebSocket](https://nodejs.org/api/globals.html#class-websocket)、[Python websockets asyncio client](https://websockets.readthedocs.io/en/stable/reference/asyncio/client.html)。2026-10-30 核对。
