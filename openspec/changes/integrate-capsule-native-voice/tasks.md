## 1. Implementation

- [x] 1.1 Add reusable voice session lifecycle and narrow public media entry.
- [x] 1.2 Connect Assistant transport, page context, transcripts and widget controls.
- [x] 1.3 Allow consultation voice while preserving tool policy restrictions.

## 2. Verification

- [x] 2.1 Verify media lifecycle, transcript ordering, protocol privacy and unsupported-policy regression.
- [x] 2.2 Build SDK, frontend, sidecar and host; run delivery verification.
- [ ] 2.3 Verify real browser/audio and managed target runtime stability; record API evidence and commit validated scope.

## Verification evidence and remaining delivery

Evidence directory: `C:/Users/zhang/AppData/Local/Temp/kai-native-voice-acceptance`.

- `capsule-tests-final.log`: 18 files / 125 SDK tests PASS, including real widget close, pending context cancellation, permission cancellation, timeout, takeover, protocol privacy and independent spoken/tool text updates. An initial unrelated voice state emission and prior consultation-rejection fixture were corrected before final runs.
- `capsule-sidecar-tests.log`: schema check and 203 tests PASS; `.test-capsule-voice` compiled current sidecar source for isolated startup without promoting the live dist directory.
- `capsule-java-tests-final.log`: SessionVoiceServiceTest 9 tests PASS. `capsule-host-build.log`: full host assembly PASS, frontend embedding skipped because the frontend is built independently for the current dev runtime.
- `capsule-build-final.log`: typecheck, architecture boundary check, Assistant SDK, Session Client SDK and full frontend build PASS. Final SDK rebuild after the panel-close correction PASS in `capsule-sdk-final.log`, local stable artifact `sha256-a8614f247c86`; this artifact update does not activate the new online backend.
- `capsule-sidecar-runtime/report.json`: isolated port 18891 PASS, seven observations over 60 seconds, missing reconnect leaves no new task/session. `capsule-host-runtime/stability.json`: isolated current host port 18091 PASS, seven HTTP 200 observations over 60 seconds; ApplicationReady recorded and error log empty. Owned isolated processes stopped and ports released.
- `capsule-forge-verify.log`: Forge CLI all PASS, zero static checkers executed and nine existing HTTP runtime probes passed. These probes do not establish audible speech or the new consultation handshake.

Real browser/audio acceptance is pending: saved browser permissions reject localhost:5173. API evidence registration for GET `/api/claude-chat/consult/ws` was attempted and rejected with `user rejected MCP tool call`; it is not registered. No SQL is needed. Online backend PID 76188 and frontend PID 80280 remain ready with zero restarts, so the new backend/sidecar code has not been activated online. Prior voice takeover and mode-picker working-tree changes remain separate dependencies; this change is not committed while real acceptance and activation are outstanding.
