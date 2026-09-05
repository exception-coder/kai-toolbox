## Context

现有 `/api/session-client/v1` 已提供 Grant-scoped REST、单次 WebSocket ticket 和安全事件投影。浏览器直连模式要求能访问 Forge 且满足 HTTPS/WSS 与 Origin；业务系统页面通常无法访问开发者局域网地址，并且浏览器 Origin 不是服务到服务身份依据。

## Goals / Non-Goals

**Goals:** 业务浏览器只连接自己的服务端；Starter 保管上游 Forge 凭据；宿主负责把业务 Principal 映射为 Forge 用户；REST 和 WS 保持既有公共协议；撤销仍由 Forge 即时生效。

**Non-Goals:** 不引入 STOMP、MQ、Redis或第二套 Agent 协议；不允许浏览器指定 `subjectUserId`、`sessionId` 或上游地址；不把内网 `ws://` 包装成互联网安全方案。

## Decisions

### Relay identity is explicit and independent

Forge Relay 入口使用独立 client id/secret，默认关闭。宿主通过 `ForgeRelayParticipantResolver` 从自己的已认证 Principal 映射 Forge 用户 ID。浏览器请求体只携带一次性邀请码，不能声明参与者身份。Forge 同时检查 Relay 身份、邀请码单次性和 Grant subject 绑定。

### Keep upstream credentials server-side

配对结果保存在 `ForgeRelayBindingStore`。Starter 默认提供有界内存实现用于本地开发；生产若希望服务重启后保持绑定，必须覆盖该 SPI，用宿主密钥加密持久化。下游浏览器只使用业务登录态；不返回 Forge access token。

### Preserve the public protocol

Starter 对 `/session`、`/messages`、`/attachments` 和 `/connections` 提供同源代理。`/connections` 返回 Starter 自己的短时单次 ticket；下游 `/ws` 消费后，Starter 再向 Forge 换取上游 ticket 并建立 WebSocket。文本帧按字节上限透明转发，Starter 不反序列化为管理协议。

### Fail closed

缺少 Participant Resolver、Relay 凭据或启用开关时不暴露入口。身份无法映射、绑定不存在、上游离线、票据重放和超限帧均返回稳定失败，不尝试匿名降级。断开任一端会关闭另一端；上游撤销事件和关闭码原样收敛到下游。

## Server Flow

```text
HTTPS Browser --business auth--> Business Spring Boot
     |                                  |
     | POST /pair(invitation)           | participant resolver
     |                                  v
     |                         encrypted binding store
     |                                  |
     | WSS /ws(local ticket)             | HTTPS/WSS or private WS
     +--------------------------> Relay Starter ----------> Forge Session Client API
                                                                  |
                                                        canonical Vibe session
                                                                  |
                                                Sidecar delegated-development policy
```

## Risks / Trade-offs

- 静态 client secret 适合内网首版，企业入口仍应叠加 TLS、网络 ACL 和可选 mTLS，并支持轮换。
- 默认内存 Store 在重启后丢失绑定，因此生产接入必须实现持久化 Store；Starter 启动时记录明确警告。
- WebSocket 桥接增加一跳延迟，但换取浏览器同源、安全凭据托管及网络可达性。

## Verification Strategy

- Forge 测试覆盖关闭默认值、Relay 认证、subject 不匹配、邀请重放和敏感错误收敛。
- Starter 测试覆盖条件装配、宿主身份解析、绑定隔离、ticket 单次消费、上游请求头和 WS 双向关闭/有界缓冲。
- 执行模块测试、TypeScript SDK 测试/构建、OpenSpec strict validation 和 Forge Quality Gate。

