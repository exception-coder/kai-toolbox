## ADDED Requirements

### Requirement: Loader provides a default request origin
系统 SHALL 在宿主未配置请求域时，使用 Loader 脚本所在 Origin 作为 Forge 请求域。

#### Scenario: Zero-configuration public Forge access
- **WHEN** 宿主从 `https://forge.example.com/assistant-sdk/loader.js` 加载 Loader 且不传 `requestBaseUrl`
- **THEN** SDK 使用 `https://forge.example.com` 作为请求域
- **AND** WebSocket 地址为 `wss://forge.example.com/api/claude-chat/consult/ws`

### Requirement: Host can override the request origin
系统 SHALL 允许宿主在 Loader 加载或 SDK 初始化时显式指定 HTTP(S) `requestBaseUrl`，且 SDK 初始化参数 MUST 具有更高优先级。

#### Scenario: Use an intranet IP
- **WHEN** 宿主配置 `requestBaseUrl: "http://10.10.8.20:8080"`
- **THEN** HTTP 请求使用 `http://10.10.8.20:8080`
- **AND** WebSocket 请求使用 `ws://10.10.8.20:8080/api/claude-chat/consult/ws`

#### Scenario: Initialize override wins over Loader default
- **WHEN** Loader 配置公网 `requestBaseUrl` 且 `initialize` 配置内网 `requestBaseUrl`
- **THEN** 该助手实例的全部派生请求使用内网 Origin

### Requirement: One request origin drives assistant endpoints
系统 SHALL 从最终请求域派生默认外部登录和 WebSocket 端点，附件与反馈归档 HTTP 端点 SHALL 继续与最终 WebSocket 端点同域。

#### Scenario: Derived external login endpoint
- **WHEN** 宿主启用 `externalLogin` 但不指定 `loginUrl`
- **THEN** SDK 请求 `<requestBaseUrl>/api/auth/external-login`

#### Scenario: Explicit legacy endpoints remain authoritative
- **WHEN** 宿主显式配置 `wsUrl` 或 `externalLogin.loginUrl`
- **THEN** SDK MUST 使用显式端点
- **AND** 不使用派生地址覆盖它们

### Requirement: Invalid request origins fail clearly
系统 MUST 拒绝非 HTTP(S) 的请求域，并在发起登录或连接前返回可诊断错误。

#### Scenario: Unsupported protocol
- **WHEN** 宿主配置 `requestBaseUrl: "file:///tmp/forge"`
- **THEN** SDK 初始化失败并说明只允许 HTTP(S) 请求域
- **AND** 不建立 WebSocket 或发起登录请求

### Requirement: User can override the request origin in the capsule
系统 SHALL 在彩虹胶囊内提供连接设置，并按 `appId` 将用户选择的 HTTP(S) Origin 保存在当前浏览器。

#### Scenario: Save an intranet request origin
- **WHEN** 用户在连接设置中输入 `http://10.10.8.20:8080` 并保存
- **THEN** 系统保存规范化后的 Origin
- **AND** 重新载入宿主页后使用该 Origin 重建登录与 WebSocket 连接

#### Scenario: Restore the host default
- **WHEN** 用户选择恢复默认请求域
- **THEN** 系统删除当前 `appId` 的浏览器覆盖
- **AND** 重新载入后恢复 SDK 初始化参数或 Loader 脚本 Origin

#### Scenario: Reject a browser-blocked mixed-content origin
- **WHEN** 当前宿主页为 HTTPS 且用户输入 HTTP 请求域
- **THEN** 系统不保存配置
- **AND** 设置面板说明需要 HTTPS 内网地址或同源代理

### Requirement: Connection settings remain usable on mobile
系统 SHALL 在窄屏中保持连接设置、保存、恢复默认和请求日志可访问，且 MUST NOT 造成头部横向溢出。

#### Scenario: Open connection settings on a narrow viewport
- **WHEN** 用户在 375 像素宽视口点击头部“连接”
- **THEN** 设置表单在胶囊内容区域完整显示
- **AND** 请求日志仍可通过折叠区查看

### Requirement: Login view exposes the request origin
系统 SHALL 在 Forge 登录视图中展示当前请求域，并允许用户在认证前切换到可访问的 HTTP(S) Origin。

#### Scenario: Switch to an intranet origin before login
- **WHEN** 公网 Forge 不可访问且用户在登录视图输入内网请求域
- **THEN** 系统按当前 `appId` 保存规范化后的 Origin
- **AND** 重新载入宿主页后从该 Origin 派生登录与 WebSocket 端点

#### Scenario: Keep the current origin while logging in
- **WHEN** 登录视图中的请求域未发生变化
- **THEN** 用户提交账号密码时直接向当前请求域发起登录
- **AND** 不触发页面重新载入
