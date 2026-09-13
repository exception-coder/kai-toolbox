## 1. Protocol and lifecycle

- [x] 1.1 Implement sidecar native realtime lifecycle on the existing thread and verify multi-turn, stop and error boundaries (design: 协议与层次、生命周期与恢复).
- [x] 1.2 Implement Java connection-owned voice negotiation/control without replaying SDP; verify unsupported, stale and disconnect cases.

## 2. Conversation UI

- [x] 2.1 Add reusable WebRTC voice control to Code conversation, retaining drafts and handling permission denial, mute, cancel, reconnect and cleanup.
- [x] 2.2 Verify desktop/mobile render and keyboard/failure recovery in a real browser.

## 3. Delivery

- [x] 3.1 Pass affected tests, frontend/sidecar builds and assembled backend build; execute Forge static/runtime quality gate.
- [x] 3.2 Verify actual native voice startup and audio round trip, restart target services and observe stable identity/HTTP/logs for at least 60 seconds.
- [x] 3.3 Synchronize usage documentation and specs as supported by evidence, review scoped diff and commit verified changes.
