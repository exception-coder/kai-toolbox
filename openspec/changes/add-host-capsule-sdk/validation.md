# Validation

## History recovery, 2026-09-06

CodexHistoryReaderTest and AssistantConversationHistoryServiceTest: 15 tests passed. Response-item text now survives streaming metadata extraction; startup context before turn_context and analysis messages remain excluded. Legacy dual events are deduplicated and append/cold-index regression checks pass.

Local Forge runtime was restarted and browser refresh restored the existing garment session 62c42a40-cebf-40f0-b147-580fca9ade44. Its three visible messages include the original import-button optimization draft. Existing automatic analysis persisted the draft without manual SQL insertion; capsule shows optimization 1, and the consumer AI feedback page shows six records including this draft. The detail contains the full requirement-json and acceptance criteria. SQLite analysis watermark advanced only after archival. Earlier tunnel-failure evidence above is superseded: the restored tunnel carried this verification successfully.

Remaining display limitation: the consumer list does not extract the new requirement-json title/expected fields and falls back to page title and an unspecified expected-effect label; the complete AI original is stored and visible in detail. No production deployment or Git submission in this recovery.

2026-09-06: assistant SDK build passed; transport 28 tests, widget 26 and prompt test passed. Capsule gateway and execution-policy tests passed. Identity and Java upstream tests passed; Java SDK install/test passed.

Real Java SDK → local Forge :18080 → Codex model passed on repeat, using a dedicated capsule participant and no invitation or Forge user login. Initial model wait timed out; its root cause is unconfirmed. SDK receive-frame limits now match the configured protocol limit. The resulting requirement-json passed the SDK's actual Zod parser: 优化, four code evidence entries and three clarification questions. Owner history HTTP 200, different participant HTTP 403; stored execution policy consult-readonly.

Yoooni One full verify passed (168 frontend tests, backend reactor); 16 container tests and unavailable Bash contracts skipped. Forge quality CLI exit 0, nine API verifiers passed, zero static checkers executed.

Not verified: deployed browser WSS chain, OpenSpec and database evidence in the live answer. No production claim, deployment or commit. Full consumer evidence is in Yoooni One openspec/changes/unify-rainbow-capsule/validation.md.

## Connection recovery release

Frontend release `20260907030818` deployed through `scripts/deploy-test.ps1 -Component Frontend`; 169 consumer tests, typecheck, architecture and release health passed. Forge SDK 57 targeted tests passed, including pre-ready retry exhaustion, manual recovery, retained queued input, paused route navigation and host configuration callback. Both OpenSpec changes validate strictly. Current artifact SHA256: `8fc05c9f8e6de962f1e9506ea4fab5d498ff31d49a1fd646910f5add0599577e`.

Actual browser inspection confirmed the explicit stopped-retry message, configuration and reconnect controls, and navigation to the administrator configuration with server address `http://127.0.0.1:28080`. Fixed the obsolete browser configuration filter to the actual `rainbow-capsule` adapter id. The server tunnel has no listener and runtime logs show upstream ConnectException; this is not an end-to-end connectivity pass. Previous automatic approval rejected tunnel restoration with `blocked by policy`; no bypass attempted. No Git submission.
