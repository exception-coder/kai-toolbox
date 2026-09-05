## Why

彩虹胶囊当前需要宿主单独拼装 `wsUrl`，运行时资源域与 Forge 请求域没有统一契约。内网用户需要在保留默认 Loader 域的同时，能显式指定内网 IP 作为全部助手通信的请求域。

## What Changes

- 为 Loader/SDK 新增可选 `requestBaseUrl`配置。
- 未配置时从 Loader 资源地址推导 Forge 请求域，保持零配置接入。
- 显式配置时允许使用 `http://<内网 IP>[:port]`，并统一派生登录、AJAX、附件和 WebSocket 地址。
- 保留现有 `wsUrl` 作为高优先级兼容覆盖，不破坏已接入项目。
- 更新快速接入文档和配置中心示例。
- 在彩虹胶囊内提供连接设置，允许用户保存或恢复浏览器级请求域覆盖。

## Capabilities

### New Capabilities
- `assistant-request-base-url`: 定义彩虹胶囊请求域的默认推导、宿主覆盖、协议转换与兼容优先级。

### Modified Capabilities

无。

## Impact

- 前端 Loader、公开 SDK 初始化契约、Widget 连接设置与 WebSocket Transport 地址解析。
- 彩虹胶囊快速接入 README 与 Forge 助手接入配置页。
- 不新增后端接口、数据表或第三方依赖。
