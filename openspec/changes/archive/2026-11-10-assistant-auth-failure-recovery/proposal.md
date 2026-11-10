## Why

彩虹胶囊在 WebSocket 握手被拒绝时无法读取 HTTP 状态，当前会永久重试并停留在“正在连接”，用户既看不到登录已失效，也没有恢复入口。线上 Yoooni One 已出现该问题，需要把连续的未建立连接失败收敛为可恢复的重新认证流程。

## What Changes

- 区分“从未成功建立连接的连续失败”和“已连接后的普通网络中断”。
- 外部登录模式下，连续握手失败达到阈值后停止自动重试、清除当前标签页 Forge 凭证并回到登录态。
- 向 Widget 暴露认证失效事件，展示明确说明和重新登录恢复路径。
- 保留短暂网络抖动的指数退避，以及已成功连接会话的断线恢复行为。
- 补充 Transport、SDK 与 Widget 回归测试。

## Capabilities

### New Capabilities
- `assistant-auth-failure-recovery`: 定义外部登录模式下 WebSocket 握手连续失败的判定、停止重试、凭证清理与重新登录恢复行为。

### Modified Capabilities

无。

## Impact

- `frontend/src/assistant-sdk/AssistantWebSocketTransport.ts`
- `frontend/src/assistant-sdk/assistantSdk.ts`
- `frontend/src/assistant-sdk/externalLogin.ts`
- `frontend/src/assistant-sdk/widget.ts`
- 相关 SDK 单元测试与公开接入说明。
- 不修改后端 API、WebSocket 协议、数据库或宿主接入契约。
