## 1. Forge trusted Relay boundary

- [x] 1.4 Add explicit invitation-bound pairing with local participant audit, preserve legacy subject mode, and verify authentication, expiry, revocation and replay.

- [x] 1.1 Add disabled-by-default Relay client properties and constant-time service authentication.
- [x] 1.2 Add server-mediated invitation exchange with Forge subject binding, audit metadata, and generic failure responses.
- [x] 1.3 Add focused tests for disabled, invalid credential, subject mismatch, replay, and successful exchange.

## 2. Spring Boot Starter foundation

- [x] 2.1 Add the independent Maven Starter module, auto-configuration imports, typed properties, participant-resolver SPI, and binding-store SPI.
- [x] 2.2 Implement bounded in-memory binding/ticket stores and an upstream REST client that never exposes or logs Forge credentials.
- [x] 2.3 Add same-origin pairing, session, history, attachment, and local connection-ticket endpoints.

## 3. WebSocket Relay

- [x] 3.1 Add the local WebSocket endpoint, single-use local ticket handshake, upstream ticket acquisition, and public-frame bridge.
- [x] 3.2 Add bounded pre-connect buffering, size limits, close propagation, and isolated cleanup.
- [x] 3.3 Test ticket replay, identity isolation, bounded buffering, upstream failure, and two-way close behavior.

## 4. SDK and documentation

- [x] 4.1 Make the TypeScript Session Client API path configurable while preserving the direct-Forge default.
- [x] 4.2 Add Starter quick-start configuration, participant mapping and production binding-store examples to OpenSpec/package documentation.
- [x] 4.3 Add migration/security guidance for HTTPS browser → business WSS → Forge WS/WSS and credential rotation.

## 5. Verification and delivery

- [x] 5.1 Run Forge module, Starter, SDK and frontend checks and fix in-scope failures.
- [x] 5.2 Run strict OpenSpec validation and Forge Quality Gate, recording only executed checks.
- [ ] 5.3 Verify a real HTTPS business application to Forge relay flow, including reconnect and revocation.
- [ ] 5.4 Register affected APIs and prepare archive after all evidence is complete.

  > 7 个新增 HTTP/WS handler 已登记并附测试证据；待 5.3 真实 HTTPS/WSS 验收后才能归档。

## 2026-09-05 invitation-bound pairing evidence

新增 `POST /api/session-client/v1/relay/invitations/pair`，请求 `participantId` 为受信宿主本地正整数键、`invitationCode` 为一次性邀请；使用原 Relay Basic client 认证，Forge subject 从 Grant 解析。旧 exchange 行为保留。该新 handler 尚未登记接口证据服务，需与真实联调一同补齐。

`mvn -q -pl tools/tool-claude-chat -am test -Dtest=SessionDelegationServiceTest,SessionClientRelayControllerTest,SessionRelayClientAuthenticatorTest -Dsurefire.failIfNoSpecifiedTests=false` exit 0，10 测试通过；涵盖新入口认证、本地键不同于 Forge subject、重放、过期及撤销，旧 subject 不匹配仍拒绝。Starter install 及 8 测试通过。Yoooni One Boot 4.1 消费测试验证新 endpoint/body 与本地 binding ID；旧协议消费测试仍通过。

`scripts/forge-quality.ps1 verify -Project . -Format json` exit 0、status PASSED；executedCheckers 为空，实际只执行 API-RUNTIME-001（现运行服务 `/api/tools` HTTP 200），不证明新接口已经部署或真实配对成功。两端 strict validation 通过。本轮不改 DDL，不归档，不覆盖其他工作区修改。
