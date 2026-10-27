## ADDED Requirements

### Requirement: Active preview lease renewal
The preview SHALL preserve its browser context while authenticated owners continue viewing or operating it. Activity SHALL extend a fifteen-minute idle lease within valid authentication, using the existing preview identity.

#### Scenario: Viewing beyond the initial deadline
- **WHEN** the owner continues retrieving frames or state beyond fifteen minutes after creation
- **THEN** the same preview stays available and an old expiry timer does not close it

#### Scenario: Hidden or disconnected viewer
- **WHEN** the viewer is hidden or stops sending requests
- **THEN** its frame/state polling stops and the server releases the browser after the idle lease expires
- **AND** returning before expiration resumes the same preview; an expired preview is not resurrected

#### Scenario: Authentication boundaries
- **WHEN** a fresh valid owner token extends a lease, or an older token request arrives concurrently
- **THEN** valid new authentication can renew it, older requests do not shorten the authorized lease, and expired tokens or other users cannot renew it

#### Scenario: Explicit end and recovery
- **WHEN** the owner closes the preview, startup times out, or the service shuts down
- **THEN** the existing browser context is released and activity cannot reopen that terminated context

## MODIFIED Requirements

### Requirement: 预览状态有界且可恢复
系统 SHALL 对启动设置 90 秒上限；预览在当前所有者有效认证下通过查看或操作续期，闲置 15 分钟或租约所依据的认证先失效时释放上下文；同一用户相同请求标识不得重复创建，不按创建时间固定中断使用中的会话。

#### Scenario: 登录未完成或启动失败
- **WHEN** 登录需要人工处理、页面失败或启动超时
- **THEN** 分别展示可理解状态及恢复入口，不无限等待、不自动重启应用

#### Scenario: 查看与接管
- **WHEN** 页面画面已就绪
- **THEN** 默认只读，用户显式开启接管后才发送点击、文字、滚动或允许按键
- **AND** READY 不等于功能验收或运行版本已经验证
