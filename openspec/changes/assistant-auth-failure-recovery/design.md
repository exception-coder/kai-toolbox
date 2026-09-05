## Context

`AssistantWebSocketTransport` 当前在 `error` 后等待 `close`，随后无条件指数退避重连。浏览器 WebSocket API 不暴露握手 HTTP 状态；当 Access Token 失效或被服务端拒绝时，客户端无法直接区分 `403` 与网络异常。外部登录客户端又会在 `sessionStorage` 中保留尚未达到本地过期时间的 Token，造成永久重试。

实现依据来自 Graphify 的 `AssistantWebSocketTransport#connect/onOpen/onClose`、`AssistantExternalLoginClient` 与 `initializeAssistant` 坐标，并以当前工作区源码和测试为最终实现事实。

## Goals / Non-Goals

**Goals:**

- 对“从未成功握手”的连续失败设置有限自动重试。
- 达到阈值时停止重试并触发外部登录失效恢复。
- 清除当前标签页凭证，让 Widget 回到可操作的登录表单。
- 保留成功连接后的断线重连和会话恢复。

**Non-Goals:**

- 不尝试从浏览器推断具体 HTTP 握手状态。
- 不改变 Forge Token 生命周期、后端鉴权或 WebSocket 协议。
- 不把普通宿主自带 `getAccessToken` 的失败强制解释成 Forge 登录失效。

## Decisions

### 1. 仅在外部登录模式启用握手失败收敛

Transport 新增可选认证失败回调。只有 SDK 创建了 `AssistantExternalLoginClient` 时才提供该回调；宿主自管 Token 保持原兼容行为。

替代方案是所有连接统一停止重试，但会破坏无登录宿主和临时网络恢复，故不采用。

### 2. 用“本轮是否曾成功 open”区分握手失败与断线

每次成功 `open` 后重置连续握手失败计数。只有 socket 在本轮从未 `open` 就关闭才累计；成功连接后的关闭继续按原策略重连，不清凭证。

### 3. 达到三次连续握手失败后进入重新认证

三次可覆盖短暂移动网络抖动，同时避免当前截图中长期十余次重试。达到阈值时取消定时器、清理 socket 引用、调用外部登录清理并通过现有 Widget 认证状态切换回登录表单。

### 4. 恢复路径由重新登录显式触发

登录成功后复用 Transport 的 reconnect 入口重新建立连接。错误状态遵循“上下文 → 原因 → 恢复动作”，不新增大图标或独立错误卡片。

## Risks / Trade-offs

- [服务端短时连续拒绝被判断为认证失效] → 仅外部登录且从未握手成功时触发，重新登录是可恢复动作。
- [移动网络较差时三次仍不足] → 指数退避仍覆盖约数秒窗口，用户可在网络恢复后重新登录；阈值由常量集中管理。
- [宿主自管 Token 无法自动清理] → 保持兼容边界，由宿主的 `getAccessToken` 自行管理刷新。

## Migration Plan

1. 发布新 Loader stable release，宿主无需改接入代码。
2. 观察 Yoooni One 外部登录与短暂断网恢复。
3. 若出现误判，可回滚 stable channel 到前一不可变 release。

## Open Questions

无。
