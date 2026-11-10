## Why

退役会话委托的提交 de7f1099 同时删除了彩虹胶囊网关及只读策略映射。SSH 隧道恢复后，Yoooni One 仍请求既有胶囊 WebSocket，Forge 因无对应 handler 返回 500。用户明确要求保留胶囊、继续移除委托。

## What Changes

- 恢复胶囊专用宿主认证、稳定用户身份和只读咨询 WebSocket，不依赖委托服务。
- 保留现有胶囊 URL 和部署凭据配置命名空间，避免要求已部署宿主重新配置。
- 不恢复 Grant、Invitation、委托接口、公共 Session Client SDK 或 Spring Boot Starter。
- 验证宿主重连、会话归属、命令限制及委托入口仍退役。

## Capabilities

### New Capabilities

- `capsule-relay-access`: 与会话委托独立的宿主胶囊咨询接入及兼容边界。

### Modified Capabilities

无；退役变更尚未同步主规格，本修复明确其胶囊例外。

## Impact

- tool-claude-chat 胶囊配置、认证与网关；SessionExecutionPolicy 的胶囊只读映射。
- 复用 AuthUserService、ProjectRouteBindingService 和普通咨询会话，不新增表或人工 SQL。
- Yoooni One 现有 Relay 协议兼容；无需修改测试服务器源码或发布宿主。
- 原始证据：本机 backend.log 的 NoResourceFoundException，测试服务器 ForgeRelayWebSocketHandler 的上游 500，de7f1099 的删除记录。
