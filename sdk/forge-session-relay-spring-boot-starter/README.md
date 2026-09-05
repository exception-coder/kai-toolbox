# Forge Session Relay Spring Boot Starter

让 HTTPS 业务前端只连接自己的 Spring Boot 服务，由业务服务连接局域网或企业入口中的 Forge。浏览器不会收到 Forge Access Token、Relay client secret 或 Forge 内网地址。

## 1. 引入 Starter

```xml
<dependency>
  <groupId>com.exceptioncoder</groupId>
  <artifactId>forge-session-relay-spring-boot-starter</artifactId>
  <version>0.1.0-SNAPSHOT</version>
</dependency>
```

## 2. 配置 Forge 与业务服务

Forge Server：

```yaml
toolbox:
  auth:
    enabled: true
  claude-chat:
    session-client:
      relay:
        enabled: true
        client-id: ${FORGE_RELAY_CLIENT_ID}
        client-secret: ${FORGE_RELAY_CLIENT_SECRET}
```

业务 Spring Boot：

```yaml
forge:
  session-relay:
    enabled: true
    forge-base-url: http://192.168.1.20:8080
    client-id: ${FORGE_RELAY_CLIENT_ID}
    client-secret: ${FORGE_RELAY_CLIENT_SECRET}
    api-path: /api/forge-session-relay/v1
```

`client-secret` 只能放在两个服务端的 Secret 管理中。跨不可信网络时把 `forge-base-url` 配为 HTTPS/WSS 入口，并叠加网络 ACL 或 mTLS。

## 3. 映射业务身份

Starter 不提供“信任请求头用户 ID”的默认实现。宿主必须从自己已经校验的登录态映射 Forge 用户：

```java
@Bean
ForgeRelayParticipantResolver forgeParticipantResolver(UserDirectory users) {
    return (principal, headers) -> {
        if (principal == null) throw new AccessDeniedException("需要登录");
        return users.requireForgeUserId(principal.getName());
    };
}
```

业务用户先调用 `POST /api/forge-session-relay/v1/pair`，请求体只有一次性邀请码：

```json
{"invitationCode":"one-time-code"}
```

用户 ID、Grant、会话和上游地址均不由浏览器提交。配对后，同一业务 Principal 可访问 `/session`、`/messages`、`/attachments`、`/connections` 和 `/ws`。

## 4. 前端 SDK

```ts
const client = createSessionClient({
  requestBaseUrl: window.location.origin,
  apiPath: '/api/forge-session-relay/v1',
})

await client.connect()
await client.send({ text: '继续完成已绑定 OpenSpec 任务' })
```

不传 `getAccessToken` 时，SDK 使用业务系统同源 Cookie。WebSocket 握手也必须进入宿主的 Cookie/Session 认证链；若业务系统仅使用不能附加到浏览器 WebSocket 握手的 Bearer Token，需要在网关先换成受保护的同源会话 Cookie。

## 生产要求

默认 `InMemoryForgeRelayBindingStore` 有界但重启会丢绑定，仅用于开发验证。生产必须提供自己的 `ForgeRelayBindingStore` Bean，以宿主密钥加密 `accessToken` 并实现到期清理。Starter 会自动退让给该 Bean。

业务系统必须继续保护 `/api/forge-session-relay/v1/**`：HTTP 与 WebSocket 握手应进入同一认证链。不要在访问日志中记录请求 Authorization、邀请码、上游 ticket 或完整 WS URL 查询串。
