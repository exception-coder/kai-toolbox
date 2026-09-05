import { ArrowRight } from 'lucide-react'
import { CodeSample } from './CodeSample'
import relaySource from './relayClientExample.ts?raw'

const relayClientId = '${FORGE_RELAY_CLIENT_ID}'
const relayClientSecret = '${FORGE_RELAY_CLIENT_SECRET}'

const dependency = `<dependency>
  <groupId>com.exceptioncoder</groupId>
  <artifactId>forge-session-relay-spring-boot-starter</artifactId>
  <version>0.1.0-SNAPSHOT</version>
</dependency>`
const forgeConfiguration = `toolbox:
  auth:
    enabled: true
  claude-chat:
    session-client:
      enabled: true
      relay:
        enabled: true
        client-id: ${relayClientId}
        client-secret: ${relayClientSecret}`
const businessConfiguration = `forge:
  session-relay:
    enabled: true
    # 替换为业务服务可访问的 Forge 地址；不传给浏览器
    forge-base-url: http://192.168.1.20:8080
    client-id: ${relayClientId}
    client-secret: ${relayClientSecret}
    api-path: /api/forge-session-relay/v1`
const identityExample = `import com.exceptioncoder.forge.sessionrelay.ForgeRelayParticipantResolver;
import org.springframework.context.annotation.Bean;

// 放在宿主 @Configuration 类中。
// UserDirectory 是你的业务用户目录服务，不是 Starter 提供的类型。
@Bean
ForgeRelayParticipantResolver forgeParticipantResolver(UserDirectory users) {
    return (principal, headers) -> {
        if (principal == null) throw new SecurityException("需要登录");
        return users.requireForgeUserId(principal.getName());
    };
}`

export function RelayDiagram() {
  return (
    <figure className="guide-relay-diagram" aria-label="Spring Boot 服务端中继架构图">
      <figcaption>浏览器走业务同源入口，Spring Boot 服务连接 Forge。</figcaption>
      <div className="guide-relay-chain"><div><strong>业务浏览器</strong><span>业务登录态 + Session Client</span></div><ArrowRight size={18} /><div><strong>业务 Spring Boot</strong><span>Starter · 身份映射 · 凭据保管</span></div><ArrowRight size={18} /><div><strong>Forge → Agent</strong><span>固定会话 · 执行画像 · 所有者审批</span></div></div>
      <ol className="guide-checklist"><li>浏览器 POST /pair，只提交邀请码；业务服务从已认证 Principal 映射 Forge 用户。</li><li>Starter 在服务端兑换并保存授权；浏览器只获得会话摘要。</li><li>SDK 通过同源 REST / WebSocket 连接 Starter；Starter 转发到 Forge 并保留原有命令与事件协议。</li></ol>
    </figure>
  )
}

export function SpringBootStart() {
  return (
    <div className="guide-sdk-start">
      <RelayDiagram />
      <p>适合已有 Spring Boot 业务后端、浏览器无法直达 Forge 内网地址的系统。参与者登录业务系统；Forge 所有者仍需先为映射后的 Forge 用户创建委托邀请。</p>
      <h3>1. 引入 Spring Boot Starter</h3>
      <p>在业务服务的 pom.xml 添加依赖。当前源码基于 Java 21 / Spring Boot 3.4；先在 Forge 仓库执行 mvn -pl sdk/forge-session-relay-spring-boot-starter -am install，或由团队发布到内部 Maven 仓库，不假设公共仓库已有该包。</p>
      <CodeSample title="Starter Maven 依赖" language="XML" code={dependency} />
      <h3>2. 配置 Forge 与业务服务</h3>
      <p>两端配置相同的 Relay client-id 和 client-secret。浏览器不持有这些值，也不接收 Forge accessToken 或内网地址。</p>
      <CodeSample title="Forge 服务端配置" language="YAML" code={forgeConfiguration} />
      <CodeSample title="业务 Spring Boot 配置" language="YAML" code={businessConfiguration} />
      <p className="guide-note">client-secret 只存于服务端 Secret 管理。示例 HTTP 地址仅用于可信内网；跨不可信网络改用 HTTPS/WSS 入口。浏览器到业务服务保持 HTTPS 同源。</p>
      <h3>3. 提供身份映射 Bean</h3>
      <p>实现 ForgeRelayParticipantResolver，将业务系统已验证的 Principal 映射为 Forge 数字用户 ID。未提供此 Bean 时，Starter 不装配接口。不能信任浏览器自报的用户 ID、会话 ID 或上游地址。</p>
      <CodeSample title="业务身份映射示意" language="Java" code={identityExample} />
      <h3>4. 业务前端配对并连接</h3>
      <p>先构建并安装同一份 @kai/session-client（命令见「SDK 接入」）。把 apiPath 指向 Starter，使用自己的业务 Cookie。下面的函数只需邀请码、事件处理器，以及可选的业务 fetch 封装。</p>
      <CodeSample title="Spring Boot 中继客户端" language="TypeScript" code={relaySource.replaceAll("'@/session-client-sdk'", "'@kai/session-client'")} />
      <p className="guide-note">不传 getAccessToken 时使用业务 Cookie；若宿主使用 Bearer，可提供业务 Token，但 HTTP 与 WebSocket 握手都必须在业务侧认证成功。业务 Token 不会被转发为 Forge Token。宿主若启用 CSRF，保留现有 CSRF 校验并通过 fetch 封装携带相应字段。</p>
      <h3>5. 接入前核对运行约束</h3>
      <ul className="guide-checklist"><li>生产提供 ForgeRelayBindingStore Bean：加密存储 accessToken，并实现到期清理。默认内存实现仅供开发验证，重启丢失绑定。</li><li>绑定按映射后的 Forge 用户保存；重新配对会替换该用户的当前绑定，不能把它当成多会话路由器。</li><li>保护 /api/forge-session-relay/v1/** 的 HTTP 和 WS 握手；不要在日志记录 Authorization、邀请码或完整 WS 查询串。</li><li>验证配对、消息、断线恢复、授权过期与撤销。Starter 的真实环境联调需要单独验收。</li></ul>
    </div>
  )
}
