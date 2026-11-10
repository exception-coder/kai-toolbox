## ADDED Requirements

### Requirement: 连续握手失败必须收敛为重新认证
彩虹胶囊在 Forge 外部登录模式下 SHALL 对从未成功建立的 WebSocket 连续失败执行有限重试，并在达到阈值后停止自动重试、清除当前标签页凭证并要求用户重新登录。

#### Scenario: 失效凭证导致连续握手失败
- **WHEN** 外部登录模式下 WebSocket 连续三次在 `open` 前关闭
- **THEN** SDK 停止自动重试并将 Widget 切换到 Forge 重新登录状态

#### Scenario: 重新登录后恢复连接
- **WHEN** 用户在认证失效状态提交有效 Forge 账号密码
- **THEN** SDK 使用新 Access Token 重新建立 WebSocket 连接

### Requirement: 短暂网络中断不得误清凭证
彩虹胶囊 SHALL 保留成功连接后的断线重连行为，并且不得仅因已建立连接随后关闭而清除 Forge 凭证。

#### Scenario: 已连接会话临时断网
- **WHEN** WebSocket 已触发 `open` 后因网络中断关闭
- **THEN** SDK 按指数退避恢复连接并保留当前认证与会话

#### Scenario: 首次握手短暂失败后成功
- **WHEN** WebSocket 在阈值内失败后成功触发 `open`
- **THEN** SDK 重置连续握手失败计数并继续正常会话

### Requirement: 非外部登录接入保持兼容
彩虹胶囊 SHALL 不对宿主自管 Token 或无认证模式强制执行 Forge 凭证清理。

#### Scenario: 宿主通过 getAccessToken 管理凭证
- **WHEN** 宿主未启用 SDK 外部登录客户端且 WebSocket 握手失败
- **THEN** SDK 保持既有重连策略，不调用 Forge 登录清理流程
