## Why

Vibe Coding 已具备会话恢复、流式事件、附件、队列、执行策略和 Agent 运行时，但当前完整入口属于 Forge 管理端；业务人员若要直接参与某个本机开发会话，只能获得过宽权限或依赖开发人员代为转述。需要把“某个受约束会话的参与权”做成稳定公共能力，让业务用户能提交小需求、补充信息并跟踪结果，同时不获得工作区、模型、引擎、权限模式和工具审批的管理权。

## What Changes

- 新增服务端签发、撤销和校验的 Session Access Grant，将参与者显式绑定到一个 Forge 会话和一个不可由 Client 放宽的能力画像。
- 新增版本化的公共 Session Client API/事件协议，只暴露发送消息、上传附件、读取/续接历史、查看进度、回答业务问题和主动中止本人请求等白名单能力。
- 新增框架无关 TypeScript SDK，提供鉴权、连接恢复、事件水位、幂等发送和错误分类，不复用或导出管理端 `ClientMessage` 全量协议。
- 新增响应式参考 Client，业务用户通过一次性邀请完成配对后进入固定会话；开发人员可在 Forge 查看参与者、暂停、撤销授权或接管会话。
- 复用现有 Vibe Coding 会话引擎、附件、历史、自动监督和 SQLite，不新增 MQ、Redis 或第二套 Agent 运行时。
- 现有 Assistant SDK 保持兼容；公共会话 SDK 与“业务咨询/需求登记”SDK 分开发布和版本化。

## Capabilities

### New Capabilities

- `delegated-session-access`: 定义会话委托、能力画像、配对、授权有效期、撤销、审计和服务端执行边界。
- `session-client-protocol`: 定义公共 REST/实时事件协议、幂等、断线续接、错误语义和兼容版本。
- `session-client-sdk`: 定义 TypeScript SDK 与参考 Client 的初始化、会话交互、恢复状态和受限用户体验。

### Modified Capabilities

无。

## Evidence Sources

- `frontend/src/assistant-sdk/AssistantWebSocketTransport.ts` 已实现连接恢复、事件序号、持久队列和发送确认，可复用传输思想但不能复用其咨询语义。
- `tools/tool-claude-chat/.../ClientMessage.java` 的内部协议包含切换权限模式、自动放行、模型、引擎、服务商和分叉会话，证明不能作为外部公共协议直接暴露。
- `SessionExecutionPolicy.java` 与 `sidecar/claude-agent/src/permissions.ts` 已证明服务端执行策略和 Sidecar 工具裁决可形成双层硬边界。
- OAuth 2.0 Security BCP 要求访问令牌最小权限、受众限制并建议发送方约束；WebSocket 规范要求服务端验证来源并使用 TLS 保护连接。

## Unresolved Decisions

- 首版默认交付浏览器/TypeScript SDK 与响应式 Web Client；是否再提供原生桌面壳由真实离线、系统通知或设备能力需求决定。
- Forge 本机对远端业务用户的网络可达性由现有企业 HTTPS 反向代理、VPN 或受控隧道提供；本变更不内置公网穿透产品。
- 若公司统一身份源暂不可用，MVP 使用 Forge 登录加一次性会话邀请；后续可增加企业 OIDC，但不能退化为长期匿名分享链接。

## Impact

- 后端：新增委托会话应用服务、授权存储、精确 CORS/Origin 校验、公共 REST 与专用 WebSocket 入口。
- Sidecar：增加不可放宽的 `delegated-development` 工具策略及确定性命令白名单。
- 前端：新增会话委托管理入口、独立 SDK 包和参考 Client；现有 Vibe Coding 管理端保持不变。
- 数据：新增 Session Access Grant、一次性邀请和审计记录的幂等 SQLite schema。
- 安全：公共 Client 永远不接收服务器绝对路径、引擎凭据、Forge 管理 Token 或原生 Agent Session ID。
