## 1. Upgrade workflow

- [x] 1.1 Implement controlled upgrade, isolated preparation, idle activation, rollback and progress endpoints.
- [x] 1.2 Connect the existing dependency panel to check and upgrade actions with recoverable states.
- [x] 1.3 Upgrade local Codex to 0.153.4 and verify model/list includes GPT-6 for the default account.

## 2. Verification

- [x] 2.1 Verify backend authorization, concurrent execution, busy state and rollback boundaries.
- [x] 2.2 Run Sidecar schema/tests, frontend type checks, UI checks and Forge quality verification.
- [x] 2.3 Record results and update the existing bug document and work log.

Verification: 13 backend tests, 162 Sidecar tests, schema check (10 methods), frontend type/boundary checks passed. Browser confirmed installed Codex 0.153.4, upgrade selector/button and recoverable rejection while another session was running. Backend was restarted through the existing local supervisor. Forge reported PASSED with API-RUNTIME-001 HTTP 200 and no executed static checkers. Rollback was fault-injected in unit tests, not by disrupting real sessions; the browser's busy gate prevented a real upgrade job during active work.

Frontend production build also passed, with non-blocking large-chunk warnings. No git commit or push was performed.
