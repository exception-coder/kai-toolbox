## Why

移动端通过局域网地址访问 Vite 工作台时，附件上传请求由开发代理转发到 Spring，但后端 CORS 只识别静态白名单，因 Origin 为动态局域网 IP 而在进入附件 Controller 前返回 403。需要在不放宽公网跨域白名单的前提下识别可信本机代理转发的同源请求。

## What Changes

- 允许来自回环代理、且 Origin 与代理声明的原始 scheme/host 完全一致的附件上传请求。
- 保持外部登录和真正跨域附件请求继续使用精确配置白名单。
- 增加局域网移动端 Origin、伪造转发头和非回环代理的 CORS 回归测试。

## Capabilities

### New Capabilities

- `mobile-chat-attachment-upload`: 定义移动端经可信本机开发代理上传会话附件时的同源识别与安全边界。

### Modified Capabilities

（无）

## Impact

- 后端：`toolbox-common` 的外部登录/附件 CORS 配置与测试。
- 前端与 API 契约：无变化，继续使用现有附件上传路径和 Bearer Token。
- 安全：动态放行仅适用于回环来源的代理连接，且 Origin 必须与 `X-Forwarded-Proto`、`X-Forwarded-Host` 完全匹配。
