## 1. Mode isolation

- [x] 1.1 Add compact mode selection, legacy navigation, permission-aware entry and independent state preservation.
- [x] 1.2 Enforce pure LLM completion in its owning backend without changing Code Agent execution.
- [x] 1.3 Add mode, permission, stream/tool rejection and existing Agent regression evidence.
- [x] 1.4 Build the host, validate updated runtime/UI and stability, update docs and commit.

## Verification evidence

- 2026-09-13: 33 frontend test files / 108 tests passed, covering existing Code Agent state, reconnect, configuration, permission mode, session client, documents, review, delegation and other current cases. The final control-mode suite separately passed 8 tests after adding actual lazy-runtime and scoped-PRD checks. These tests use isolated fixtures, not real Agent task execution.
- PureLlmCompletionTest: 4 Java tests passed. Verified request has no tool specifications, unsolicited tool calls produce ERROR with no second round, invalid mode fails before persistence/model invocation, normal output and idempotent stop preserve completion state. No paid model request was sent.
- Full host package passed (exit 0), including frontend production build and host assembly. A test fixture typing error found in the first build was corrected; the final frontend typecheck and architecture check passed after removing a private cross-feature test import. Existing bundle-size warnings remain unchanged.
- Real browser: unified sidebar entry, pure LLM history/model controls, switch back to a connected existing Code Agent session, and legacy /tools/ai-chat redirect verified. At 375 × 900 the document width was 375 px, mode switch and composer remained available; main navigation was opened successfully. Browser viewport restored. No chat message or tool action was sent through the real UI.
- Backend reloaded through the existing supervisor restart endpoint. Current Java PID 18228 (started 01:39:17), backend wrapper 28220, frontend 46980; development mode uses :18080 / HTTPS :5173. Current startup log contains Started ToolboxApplication and no fatal startup/OOM failure. Expected mode rejection returned HTTP 400 with the new LLM-only reason; conversation and Agent session APIs returned 200 (2 and 190 records respectively), without sending a real message.
- Stable observation passed for 80 seconds: both services ready, identities/restart counts unchanged, HTTP health and mode rejection continuously correct. Existing WeChat waiting-restart state (4), unavailable aria2/ASR/Ollama are outside this delivery; no dependency or health requirement was disabled.
- Forge CLI full gate returned exit 0 / PASSED after readiness. Nine API-RUNTIME-001 scenarios executed; static stage PASSED with executedCheckers=[], so no static checker is claimed. One earlier gate attempt ran before the new HTTP listener was ready and failed with ConnectException; it was rerun after readiness and passed.
- The original Code Agent backend and SDK were not modified; existing requests and model streams use separate tool modules and conversation stores. Scoped local commit only, no push. Real paid upstream-model generation was not executed; streaming/tool rejection was verified using controlled model responses.
