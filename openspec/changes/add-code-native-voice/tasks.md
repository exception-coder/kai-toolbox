## 1. Protocol and lifecycle

- [x] 1.1 Implement sidecar native realtime lifecycle on the existing thread and verify multi-turn, stop and error boundaries (design: 协议与层次、生命周期与恢复).
- [x] 1.3 Make ordinary official Codex threads realtime-ready, fork legacy text-only history on capability rejection, and only expose recovery after confirmed connection.
- [x] 1.2 Implement Java connection-owned voice negotiation/control without replaying SDP; verify unsupported, stale and disconnect cases.
- [x] 1.4 Allow validated voice lease controls through the embedded capsule boundary so heartbeat does not close the relay WebSocket.

## 2. Conversation UI

- [x] 2.1 Add reusable WebRTC voice control to Code conversation, retaining drafts and handling permission denial, mute, cancel, reconnect and cleanup.
- [x] 2.2 Verify desktop/mobile render and keyboard/failure recovery in a real browser.

## 3. Delivery

- [x] 3.1 Pass affected tests, frontend/sidecar builds and assembled backend build; execute Forge static/runtime quality gate.
- [x] 3.2 Verify actual native voice startup and audio round trip, restart target services and observe stable identity/HTTP/logs for at least 60 seconds.
- [x] 3.3 Synchronize usage documentation and specs as supported by evidence, review scoped diff and commit verified changes.

## 4. Transcript placement correction

- [x] 4.1 Route both transcript roles into existing chat bubbles, preserving utterance order, final corrections, call isolation and native output boundaries (design: 语音消息接入; scenario: Speech appears in the existing conversation).
- [ ] 4.2 Run transcript and transport regressions, frontend checks and Forge verification; verify the actual browser when access is available.

## 5. Refresh recovery

The deferred-start behavior below was superseded by the user's explicit request for immediate mid-task audio reconnection; retain its evidence as prior validation only.

- [x] 5.1 Preserve per-session recovery hints and allow cancellable voice requests during an active code task, without interrupting that task or automatically capturing on reload (design: 生命周期与恢复; scenario: Refresh or request voice while code is running).
- [ ] 5.2 Verify refresh, resume, cancellation, session isolation, disconnection, visibility and denied media paths; run frontend build and Forge checks, then perform available runtime acceptance.

## 6. Immediate audio reconnection

- [x] 6.1 Reconnect audio on the existing live native thread, preserving the running task and handling close/reconnect/completion/cancel races (design: 生命周期与恢复; scenario: Refresh and reconnect while code is running).
- [x] 6.2 Route running-session voice offers through owner-validated Java/sidecar reconnection without startTurn or code-task error side effects.
- [ ] 6.3 Remove deferred UI start, update user guidance, run frontend/sidecar/backend and host validation, register the changed WS contract, and complete available runtime acceptance.

## 7. Explicit device takeover

- [x] 7.1 Replace the live audio owner after eligibility validation; notify the displaced browser, serialize native negotiations and let the latest explicit request supersede older attempts.
- [x] 7.2 Verify idle listening, running code, successive takeovers, cancellation, stale controls and visible local media release; update builds and runtime evidence.
- [ ] 7.3 Activate the new runtime and complete real desktop/phone audio acceptance before delivery; browser access to localhost:5173 remains denied by the saved user permission setting.

Takeover evidence (2026-09-13): sidecar schema checks and 203 tests passed, including 15 voice lifecycle tests and takeover after a previous device has already entered SDP negotiation. Eight Java SessionVoiceService tests passed with Java 21, covering latest ownership, rejected eligibility, displaced-owner notification and ignored stale controls. The frontend suite passed 133 tests; the final mode-picker/workspace rerun passed 10 tests after correcting an unsupported test-query type option. Typecheck and full frontend build passed. Current host assembly passed with frontend embedding skipped; the dev frontend was built separately. Newly compiled sidecar on 18891 and assembled host on 18091 each passed isolated 60-second observations; the host returned HTTP 200 at seven samples from 18:15:33 to 18:16:33 UTC and had an empty error log. Owned test processes were stopped and test ports were clear afterward. Forge CLI returned PASSED, zero executed static checkers and nine existing-runtime API probes (not voice acceptance). A new affected-API registration attempt for device takeover returned `user rejected MCP tool call`; registration remains incomplete. Browser access was retried after the user's new instruction to operate and explicitly denied by the saved localhost:5173 permission setting. Online sidecar dist promotion/activation, real audio takeover and browser verification remain pending, so no completed-delivery commit is claimed.

Immediate reconnection evidence (2026-09-13): frontend chat suite passed 130 tests in 37 files; typecheck and full frontend build passed. With the configured Java 21, `mvn -pl tools/tool-claude-chat -am test -q` passed (400 reported, zero failures/errors, one skipped; seven SessionVoiceService tests). The assembled host passed `mvn -pl toolbox-starter -am package "-Dskip.frontend=true" "-DskipTests" -q`; frontend output was separately verified and this host check does not claim refreshed embedded assets. Sidecar schema checks and 201 tests passed, including close timeout and failed negotiation retry. Its full TypeScript compile passed, but `npm run build` refused dist promotion because the existing service still listens on 18890; that live service was preserved. An isolated instance of the compiled sidecar on 18891 passed reconnect-error/session-state WS probes and seven samples over 60 seconds, with no code task created. Forge CLI returned PASSED with zero executed static checkers and nine API-RUNTIME-001 scenarios against the existing runtime; these do not validate the new audio path. `register_affected_apis` was attempted for GET `/api/claude-chat/ws` and returned `user rejected MCP tool call`; registration remains incomplete. Real-browser/audio acceptance remains unavailable after the prior browser permission denial. Live activation, affected-API registration and end-to-end audio acceptance remain open; no commit or completed delivery is claimed.

The newly assembled host also passed isolated startup on 18091 with a separate home/database, ApplicationReadyEvent evidence and seven HTTP 200 `/api/tools` samples over 60 seconds (17:45:50–17:46:50 UTC); its error log was empty. The owned test process was then stopped. This proves current backend assembly/startup, not an actual account's audio reconnect. Existing Forge backend/frontend remain ready at PIDs 76188/80280, zero restarts; unrelated WeChat helper remains waiting for restart. OpenSpec strict validation and `git diff --check` passed. No live service replacement was performed because dist promotion is protected while the active task uses the current sidecar.

### Prior correction evidence

Refresh correction evidence (2026-09-13): the supplied screenshot shows a disconnected local voice UI and a still-running code task. Source confirms browser disconnection stops only audio, while the button previously disabled all starts during `chat.running`. `NativeVoiceControl.test.tsx` now passes 10 component/media-boundary tests, including remount recovery, deferred start exactly once, cancellation/focus, session switch, socket loss, hidden page, denied microphone and changed eligibility. The broader chat suite passed 129 tests before the final focus refinement; the latest focused run passed all 10 recovery tests afterward. Typecheck and the full frontend build passed; Vite built the final component after that refinement. Forge CLI returned staticStatus/runtimeStatus PASSED with zero executed static checkers and nine API-RUNTIME-001 scenarios. At 10:12 and 10:15 the backend/frontend PIDs remained 76188/80280 with zero restarts and ready status; the nine API checks returned HTTP 200 at both ends. The existing WeChat helper is not ready and is outside this correction. No backend contracts, database scripts or service restarts were changed. Browser permission denial still prevents live refresh/audio acceptance; supplied screenshot plus component tests do not establish a new real audio round trip. Task 5.2 remains open and changes remain uncommitted for that acceptance.

2026-09-13 correction evidence: `npm test -- src/features/claude-chat --maxWorkers=2` passed all 120 tests across 36 files; the initial concurrent run timed out in the existing public runtime import test, which passed both alone and in the bounded-concurrency suite without changing its timeout. `npm run typecheck` and `npm run build` passed. Forge CLI `./scripts/forge-quality.ps1 verify -Project . -Format json` returned staticStatus/runtimeStatus PASSED, with no executed static checkers and nine API-RUNTIME-001 scenarios; these API checks do not cover voice bubbles. Browser access to the existing localhost page was denied by the browser permission policy, so the actual screen and new voice round trip remain unverified. No service restart was requested for this frontend-only correction. Task 4.2 remains open and this correction is not committed pending that acceptance; previous section 3 evidence belongs to the earlier native voice implementation.
