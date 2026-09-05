# KAI 统一嵌入式 AI 助手

KAI Assistant SDK 用于把统一 AI 助手嵌入 ERP、SCM、SRM、JSP 旧系统或其他 Web 页面。宿主只负责加载 SDK、提供当前用户与业务上下文；Loader 默认使用自身所在域连接 Forge，也可通过 `requestBaseUrl` 指向内网 IP。会话恢复、待发送队列、Markdown 消息、诊断、草稿确认和需求登记由统一链路处理。

当前版本提供框架无关的 Web Component，以及 ESM、IIFE 两种构建产物。业务系统默认通过 Forge 托管的稳定 Loader 接入；Loader 会读取渠道清单、校验 SRI，并加载当前 `stable` 或 `canary` 版本，宿主无需反复复制 SDK 文件。

## 快速导航

- **第一次接入**：[快速初始化](#快速初始化)
- **灰度与回退**：[Loader 发布与渠道](#loader-发布与渠道)
- **只在某个 JSP 页面使用**：[JSP 单页接入](#jsp-单页接入)
- **没有宿主 Token 接口**：[Forge 账号直接登录](#forge-账号直接登录)
- **页面或订单变化**：[更新业务上下文](#更新业务上下文)
- **隐藏、唤醒和移动**：[入口显示与位置](#入口显示与位置)
- **接入生产环境**：[认证与网络边界](#认证与网络边界)
- **遇到连接问题**：[常见问题](#常见问题)

---

## 功能能力

- 业务咨询、Bug、建议和协助诊断四种显式入口。
- 自动采集页面、业务对象、Provider、JS 错误和异常网络等必要上下文。
- 发送即时显示、准备上下文状态、Markdown 回复和生成期发送门禁。
- 输入框支持 `Ctrl/⌘ + V` 直接粘贴 PNG、JPEG、GIF、WebP 图片，发送前可预览和移除；最多 5 张、单张 10MB、合计 25MB。
- WebSocket 断线恢复、消息水位去重和运行中待发送队列。
- 按认证用户复用模块首次探索摘要；版本变化、过期或读取失败时自动回到实时探索。
- Bug、建议草稿确认与幂等需求登记。
- Shadow DOM 样式隔离，不复制宿主 React、Vue 或 JSP 组件。
- 彩虹胶囊入口，支持跨端拖动、位置恢复、隐藏和快捷键唤醒。

---

## Loader 发布与渠道

生产宿主只固定引用稳定 Loader：

```html
<script src="https://kai-tool.exception-coder.com/assistant-sdk/loader.js"></script>
```

Loader 每次初始化都会读取 `channels/stable.json`，再加载内容寻址的不可变 SDK 资源。Forge 更新 `stable` 指针后，各宿主下次刷新页面自动使用新版本，不需要重新构建或发布宿主项目。灰度系统可把 `channel` 改为 `canary`；回退时只需把渠道清单重新指向已发布版本。

Forge 发布命令：

```powershell
Set-Location frontend
npm run assistant:release          # stable
npm run assistant:release:canary   # canary
```

`npm run dev` 和 `npm run build` 均已包含 `assistant:release`，开发服务重启或正式构建都不会漏发 Loader 产物。

---

## 构建 SDK

在项目根目录执行：

```powershell
Set-Location frontend
npm install
npm run assistant:build
```

构建结果位于 `frontend/dist-assistant/`：

| 产物 | 用途 |
|---|---|
| `kai-assistant.es.js` | React、Vue、Angular、Vite 等现代构建系统 |
| `kai-assistant.iife.js` | JSP、原生 HTML 或不使用前端打包器的页面 |
| `types/` | TypeScript 类型声明 |
| `package.json` | 本地安装或发布到公司 npm 仓库所需的包清单 |
| `README.md` | 随 SDK 交付的初始化与接入说明 |

`dist-assistant` 主要用于 Loader 发布、离线调试和紧急回退。确有构建期类型依赖时，仍可从本地目录安装：

```powershell
npm install D:\work\kai-toolbox\frontend\dist-assistant
```

---

## 快速初始化

现代前端项目加载 Loader 后，只初始化一次：

```ts
const { sdk, version } = await window.KaiAssistantLoader.load({ channel: 'stable' })
const assistant = sdk.initialize({
  appId: 'ERP',
  appName: 'ERP',
  sourceRevision: 'erp-2026.08',
  getAccessToken: () => getAssistantAccessToken(),
  user: {
    id: String(currentUser.id),
    displayName: currentUser.name,
    roles: currentUser.roles,
  },
  page: {
    url: location.pathname,
    routeName: 'sales-order-detail',
    title: document.title,
  },
  businessObject: {
    type: 'SALES_ORDER',
    id: String(order.id),
    attributes: {
      orderCode: order.code,
      status: order.status,
    },
  },
})

console.info('KAI Assistant SDK', version)
```

上述零配置方式会从 Loader 地址推导请求域。例如 Loader 来自 `https://forge.company.com/assistant-sdk/loader.js`，登录、附件、归档和 WebSocket 都使用 `https://forge.company.com`。

内网宿主可显式覆盖请求域，SDK 产物仍由原 Loader 域发布：

```ts
const { sdk } = await KaiAssistantLoader.load({
  channel: 'stable',
  requestBaseUrl: 'http://10.10.8.20:8080',
})
const assistant = sdk.initialize({
  appId: 'ERP',
  externalLogin: {},
})
```

`requestBaseUrl` 只接受 HTTP(S) Origin。HTTPS 宿主不能请求 HTTP 内网地址，否则会被浏览器 Mixed Content 策略拦截；此时应给内网 Forge 配置 HTTPS，或由宿主同源反向代理。

用户也可以在彩虹胶囊标题栏点击“连接”，填写内网 Forge 请求域并选择“保存并重新连接”。该选择按 `appId` 保存在当前浏览器，优先于 Loader 和 `initialize` 的请求域；不会保存账号、密码或 Token。选择“恢复默认”后，重新使用接入方配置或 Loader 脚本所在域。

`initializeAssistant` 是幂等单例初始化。同一页面重复调用会返回已有实例；页面或微前端彻底卸载时调用 `assistant.destroy()`。

`page.routeName` 是模块缓存的首选稳定键；未提供时 SDK 会从 URL 去除查询参数和动态数字/UUID 路径段。`sourceRevision` 建议使用宿主发布版本或上下文结构版本，变化后旧摘要立即失效。摘要按 Forge 认证用户隔离、默认保留 7 天，只作为历史线索，本轮页面与 Provider 上下文仍会实时采集。

---

## JSP 单页接入

如果只希望某个 JSP 页面使用助手，不需要修改公共 Layout，也不需要复制 IIFE 文件。只在目标 JSP 的 `</body>` 前加载：

```jsp
<script src="https://kai-tool.exception-coder.com/assistant-sdk/loader.js"></script>
<script type="module">
  const { sdk } = await KaiAssistantLoader.load({ channel: 'stable' })
  const assistant = sdk.initialize({
    appId: 'ERP',
    appName: 'ERP',
    wsUrl: '${pageContext.request.contextPath}/assistant-ws',
    getAccessToken: function () {
      return window.getAssistantAccessToken()
    },
    user: {
      id: String(window.currentUser.id),
      displayName: window.currentUser.name
    },
    page: {
      url: window.location.pathname,
      title: document.title
    },
    visibility: {
      initiallyHidden: false
    },
    draggable: true
  })
</script>
```

旧 JSP 工程不需要引入 React，也不需要复制 Widget 样式。目标浏览器需要支持现代 JavaScript、Web Component、Shadow DOM 和 WebSocket；不支持 Internet Explorer。

---

## Forge 账号直接登录

内部试用阶段如果宿主没有 `getAssistantAccessToken()`，可以让助手直接使用现有 Forge 账号登录。宿主只配置 Forge 登录和咨询地址：

```jsp
<script src="https://kai-tool.exception-coder.com/assistant-sdk/loader.js"></script>
<script type="module">
  const { sdk } = await KaiAssistantLoader.load({ channel: 'stable' })
  const assistant = sdk.initialize({
    appId: 'ERP',
    appName: 'ERP',
    requestBaseUrl: 'https://forge.company.internal',
    externalLogin: {},
    user: {
      id: String(window.currentUser.id),
      displayName: window.currentUser.name
    },
    page: {
      url: window.location.pathname,
      title: document.title
    }
  })
</script>
```

首次打开助手时显示 Forge 登录表单。登录成功后才显示咨询输入区并建立真实会话。密码只参与单次 HTTPS 请求；专用接口不签发 REFRESH Token，ACCESS Token 与绝对过期时间只保存在当前标签页的 `sessionStorage`，页面刷新或 SPA 重新挂载后可继续使用，关闭标签页、Token 到期或认证失败后需要重新登录。

Forge 后端必须显式开启并配置完整 Origin：

```yaml
toolbox:
  auth:
    external-login:
      enabled: true
      allowed-origins:
        - "https://erp-test.company.internal"
  claude-chat:
    ws:
      consult-allowed-origin-patterns:
        - "https://erp-test.company.internal"
```

也可以通过环境变量临时开启：

```powershell
$env:TOOLBOX_AUTH_EXTERNAL_LOGIN_ENABLED='true'
$env:TOOLBOX_AUTH_EXTERNAL_LOGIN_ALLOWED_ORIGINS='https://erp-test.company.internal'
```

`externalLogin` 与 `getAccessToken` 同时配置时，以 `getAccessToken` 为准，不展示 Forge 登录表单。外部登录模式只为 `/api/auth/external-login`、`/api/claude-chat/sessions/{sessionId}/attachments` 和 `/api/assistant/feedback-sessions/**` 注册精确 Origin CORS；附件上传和反馈归档都必须携带 ACCESS Token 并通过会话归属校验。原登录、刷新、用户管理及其他 Forge API 均保持同源。

已有接入可继续显式传入 `wsUrl` 和 `externalLogin.loginUrl`，它们的优先级高于 `requestBaseUrl`，无需立即迁移。

登录后的助手标题栏提供“记录”入口。归档页按咨询会话固定展示 `Bug`、`优化建议`、`需求` 三个标签及数量；点击标签可回顾候选、修正分类与描述、查看 AI 原始识别和历次用户修订。发送时上传的图片会以逻辑附件 ID 与服务端轮次关联，归档中通过受控接口重新加载，不向浏览器暴露服务器绝对路径。

---

## 更新业务上下文

页面路由、Tab 或当前业务对象变化时，显式更新快照：

```ts
assistant.updateContext({
  page: {
    url: location.pathname,
    routeName: 'sales-order-list',
    title: document.title,
  },
  businessObject: undefined,
})
```

SDK 默认同时观察浏览器 `pushState`、`replaceState`、前进/后退和 Hash 变化。Path 或有效查询参数变化后，会自动清空旧页面投影，以“认证用户 + appId + 规范化 URL”重新解析 `sessionId`，再加载对应会话的近期消息和 Bug、优化建议、需求归档。普通 SPA 路由无需重复调用 `updateContext`；宿主需要完全自行管理路由时可设置 `trackPageUrl: false`。

不要扫描整个 DOM 猜测业务对象，也不要把实时响应式对象直接交给 SDK。

需要异步补充只读上下文时注册 Provider：

```ts
const unregister = assistant.registerProvider({
  id: 'sales-order-detail',
  async collect(signal) {
    const order = await loadCurrentOrder({ signal })
    return {
      key: 'salesOrder',
      value: {
        id: order.id,
        status: order.status,
        auditStatus: order.auditStatus,
      },
    }
  },
})

// 页面卸载时注销
unregister()
```

Provider 必须只读，不得保存、审核或修改宿主业务数据。

---

## 主动打开能力

宿主业务按钮可以直接打开指定模式：

```ts
assistant.open('QUESTION')
assistant.open('BUG')
assistant.open('SUGGESTION')
assistant.open('DIAGNOSE')
```

主动打开前可以先调用 `updateContext`，把用户点击的订单、供应商或其他业务对象绑定到本次请求。

当前请求处于准备、连接或回复阶段时，Widget 会显示“中止”。宿主也可以主动调用：

```ts
assistant.interrupt()
```

准备阶段会取消页面 Provider 收集；执行阶段会通过 WebSocket 中止当前 AI 回合。服务端待发送列表不会被批量删除。

标题栏“连接”按钮可设置当前浏览器的 Forge 请求域；同一面板的“请求日志”折叠区展示上下文采集、连接、协议类型、序号、中止和错误阶段。日志最多 200 条且不持久化，不包含密码、Token、Cookie、问题正文或上下文值。

---

## 入口显示与位置

默认显示可拖动的彩虹胶囊入口。桌面端可以拖动胶囊和对话框；移动端可以拖动胶囊，对话框保持固定全屏布局。位置按 `appId + user.id` 保存在浏览器本地。

需要默认隐藏时：

```ts
const assistant = initializeAssistant({
  appId: 'ERP',
  wsUrl: '/assistant-ws',
  visibility: {
    initiallyHidden: true,
    activationKey: '由宿主配置的显示密钥',
  },
})
```

默认唤醒快捷键：

- Windows/Linux：`Ctrl + Alt + Shift + 0`
- macOS：`Command + Option + Shift + 0`

快捷键只打开显示密钥输入层，不承担用户认证。宿主受信任按钮调用 `assistant.open(...)` 时可以直接显示助手。

---

## 认证与网络边界

SDK 的 `user.id` 只用于上下文、会话分区和位置存储，不能作为服务端可信身份。生产接入应由宿主后端校验现有登录态，再换取短期 Assistant ACCESS token；SDK 每次建连时通过 `getAccessToken` 获取 Token，不写入本地存储。`externalLogin` 是内部快速验证能力，正式跨系统发布前仍应升级为短期、限域的 Assistant Token。

推荐将宿主的同源地址：

```text
/assistant-ws
```

反向代理到 Forge Assistant Server：

```text
/api/claude-chat/consult/ws
```

代理需要支持 WebSocket Upgrade，并避免在访问日志中记录完整的 Token 查询参数。服务端生产配置必须收紧：

```yaml
toolbox:
  claude-chat:
    ws:
      consult-allowed-origin-patterns:
        - "https://erp.company.internal"
```

不要在生产环境保留 `*`，也不要把 ERP Cookie、登录密码或业务 Token 放进上下文 Provider。

---

## 常用配置

| 配置 | 默认值 | 说明 |
|---|---|---|
| `appId` | 必填 | 宿主系统稳定标识，也是本地存储分区的一部分 |
| `appName` | 空 | 展示和上下文中的系统名称 |
| `sourceRevision` | 空 | 宿主发布或上下文结构版本；变化时使旧模块探索摘要失效 |
| `requestBaseUrl` | Loader 脚本 Origin | Forge HTTP(S) 请求域；可在 Loader.load 或 initialize 中配置内网 IP |
| `wsUrl` | 从 `requestBaseUrl` 派生 | 兼容显式 WebSocket 地址，优先级高于派生值 |
| `getAccessToken` | 空 | 建连时动态获取短期 Token |
| `externalLogin.loginUrl` | 从 `requestBaseUrl` 派生 | 使用现有 Forge 账号登录；显式值优先，仅在未配置 `getAccessToken` 时生效 |
| `engine` | `codex` | 默认执行引擎，可选 `codex` 或 `claude` |
| `providerTimeoutMs` | SDK 默认值 | 单个上下文 Provider 的超时控制 |
| `additionalSensitiveFields` | 空数组 | 上传前需要额外遮蔽的字段名 |
| `visibility.initiallyHidden` | `false` | 是否默认隐藏助手入口 |
| `draggable` | `true` | 跨端允许移动胶囊；桌面端同时允许移动对话框 |

---

## 常见问题

**页面没有出现助手**

- 确认 IIFE 文件请求成功且 `KaiAssistant` 存在。
- 如果配置了 `initiallyHidden: true`，使用默认快捷键或调用 `assistant.open()`。
- 检查是否重复销毁实例，或宿主 CSP 是否禁止加载脚本。

**点击发送后一直连接失败**

- 点击标题栏“连接”并展开“请求日志”，确认停在上下文采集、认证、WebSocket 建连还是服务端响应阶段。
- 若请求无需继续等待，点击输入区旁的“中止”。
- 检查 `/assistant-ws` 是否正确代理到 `/api/claude-chat/consult/ws`。
- 检查代理是否支持 `Upgrade` 和 `Connection` 请求头。
- 检查短期 Token、WebSocket Origin 白名单和 HTTPS/WSS 配置。
- 使用内网 IP 时，确认宿主浏览器能访问 `requestBaseUrl`，且 HTTPS 页面没有指向 HTTP 地址。

**页面上下文不正确**

- 在路由和业务对象变化时调用 `updateContext`。
- 确保 Provider 返回可序列化快照，不返回 DOM、React/Vue 实例或循环引用。

**胶囊遮挡页面按钮**

- 直接拖动到合适位置；桌面端和移动端都会恢复胶囊的上次位置。
- 配置默认隐藏，通过快捷键或业务按钮按需打开。

---

## 开发验证

```powershell
Set-Location frontend
npx vitest run src/assistant-sdk
npm run typecheck
npm run assistant:build
```

协议和实现设计参见：

- [技术设计](../../../docs/design/企业内部多Web系统统一嵌入式AI助手/企业内部多Web系统统一嵌入式AI助手-current.md)
- [API 契约](../../../docs/design/企业内部多Web系统统一嵌入式AI助手/企业内部多Web系统统一嵌入式AI助手-api-current.md)
- [IIFE 接入示例](../../../frontend/examples/assistant-embed.html)
