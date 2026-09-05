## Why

HTTPS 业务前端无法安全地直接连接开发人员局域网中的 Forge `ws://`，也不应持有 Forge 登录令牌或 Grant Token。需要提供一个 Spring Boot Starter，使业务前端只连接自己的同源业务服务，由业务服务以受信服务身份连接 Forge，并把外部用户映射到既有 Session Access Grant。

## What Changes

- 在 Forge 增加默认关闭的服务端 Relay 配对入口，以服务凭据认证业务服务，并由 Forge 再校验邀请绑定的参与者。
- 发布 `forge-session-relay-spring-boot-starter`，提供自动配置、业务身份映射 SPI、服务端绑定存储 SPI、同源 REST 代理和 WebSocket 双向桥接。
- 浏览器沿用业务系统登录态，不接收 Forge Token、局域网地址、工作区路径或管理协议。
- 扩展 `@kai/session-client` 的可配置 API 路径，使同一 SDK 可连接 Forge 直连入口或业务服务 Relay 入口。
- 保留 Forge 网关与 Sidecar Tool Policy 两层执行约束；Relay 不解释或放宽公共会话协议。

## Capabilities

### New Capabilities

- `server-relayed-session-client`: 定义业务服务代理配对、身份映射、REST/WS 中继、凭据保管、断线和撤销语义。
- `session-client-spring-boot-starter`: 定义 Spring Boot 自动配置、宿主 SPI、属性、接入契约与可替换存储。

### Modified Capabilities

- `session-client-protocol`: 公共协议允许由受信 Relay 代表已认证业务用户建立同一 Grant 的连接，但不得改变命令、事件或权限边界。

## Impact

- 新增独立 Maven Starter 模块，不让业务项目依赖 Forge 内部模块。
- Forge 新增服务端配对 HTTP handler；默认关闭并要求独立 Relay 凭据。
- 无人工执行 SQL；Starter 默认内存绑定仓储仅用于开发，生产宿主必须提供持久化加密实现。
- 远端浏览器只访问业务域名的 HTTPS/WSS；业务服务到 Forge 可在受控内网使用 WS，生产推荐 TLS/VPN/mTLS。

