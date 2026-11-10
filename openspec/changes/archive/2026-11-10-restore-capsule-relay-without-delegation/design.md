## Context

M 档兼容修复：公开 WebSocket 与认证边界受影响，不能只恢复监听或整份回滚。Graphify 已查询，但退役后的坐标以 de7f1099 diff 和当前源码核验为准。

删除前 CapsuleRelayGateway 仅依赖 CapsuleRelayIdentityService 和 ClaudeChatWebSocketHandler；身份服务通过委托包中的 SessionRelayClientAuthenticator 验证宿主。AuthUserService.resolveClientIdentity、ProjectRouteBindingService.resolve 和咨询会话所有权校验仍存在。SessionExecutionPolicy 丢失胶囊 URI 到 CONSULT_READONLY 的映射，必须同时补齐。

## Goals / Non-Goals

恢复已部署 Yoooni One 胶囊连接和原有咨询会话；继续禁止会话委托、邀请码、Grant、公共 Session Client REST/WS 和 SDK。无数据库迁移、凭据重置或宿主升级。

## Decisions

### 独立胶囊组件

恢复 CapsuleRelayConfiguration、CapsuleRelayGateway、CapsuleRelayIdentityService。以 CapsuleRelayClientAuthenticator 和 CapsuleRelayProperties 代替委托认证组件，不引入 delegation 包、异常枚举或服务。认证失败返回通用 403，不泄漏 Secret。

同时恢复 CapsuleRelayController 的原有受限 REST 适配，用于胶囊历史、反馈与附件；只转发 assistant conversations/feedback-sessions 及会话 attachments，不能成为任意 API 或委托代理。附件先核验当前胶囊用户所有权，forward 完成或失败都恢复 AuthContext。

保留 `/api/session-client/v1/relay/capsule/ws` 和 `toolbox.claude-chat.session-client.relay` 作为兼容契约；名称沿用不代表恢复整个 Session Client。配置中心显示胶囊接入，保留多客户端开关、每客户端启停、常量时间凭据比较与动态刷新；managed 空列表必须拒绝，不能回退旧单客户端凭据。

### 服务端固定咨询范围

宿主 client id 经现有项目绑定解析；client id 与 participant id 映射稳定内部用户，继续使用原有会话数据。只接受既有咨询和语音保活命令，open 固定项目、应用、Codex 和 plan，剥离目录与凭据等开发配置。通过 SessionExecutionPolicy.CAPSULE_WS_PATH 固定只读域，复用 canBind 和所有权校验，禁止绑定开发域或其他用户会话。逐消息重新核验宿主身份，撤销后关闭连接。

### 产品原则

适用 OBJ-01、CTX-01、AI-01、FEED-01、EVID-01、CTRL-01，无例外。主对象是宿主用户在已绑定系统中的咨询会话；复用原面板，不增加页面、选择器或委托 UI。保持原会话 ID 和上下文，失败仍允许重新连接。没有 UI 布局改动；验收需检查现有面板真实就绪和重连后的会话，HTTP 200 或端口监听不能代替该证据。

## Risks / Trade-offs

- 只恢复网关却遗漏只读域会扩大权限：专项测试固定入口策略、禁止开发命令与跨域绑定。
- 新类遗漏 Spring 装配：除单元测试外执行宿主构建和真实 WebSocket 握手。
- 历史配置缺失：检查既有动态配置有效性，不打印凭据；保留默认关闭行为。
- 其他工作区改动与运行会话：仅提交本次明确路径，重启通过 Forge 管理入口，完成 60 秒稳定观察。

## Migration Plan

先运行复现测试，再补实现、运行专项与宿主构建；重启本机 Forge，验证服务器 28080 的普通 HTTP 和带认证胶囊 WS、会话恢复及委托路由缺失。执行 Forge 全阶段质量门禁，稳定观察后提交。回滚仅撤销本次胶囊修复，会再次关闭胶囊；不回滚委托退役或删除历史数据。
