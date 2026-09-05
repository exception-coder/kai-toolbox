## 1. Forge trusted Relay boundary

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
