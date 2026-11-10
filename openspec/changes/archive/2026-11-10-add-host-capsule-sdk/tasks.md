## 1. Implementation

- [x] 1.1 Add JS host transport hooks and disable direct preferences/login in host mode.
- [x] 1.2 Extend Java SDK and implement Forge capsule boundary.
- [x] 1.3 Reuse structured requirement validation and copy actions.

## 2. Validation

- [x] 2.1 Compile SDK/backend and test readonly frame boundaries and host URL transport.
- [x] 2.2 Verify identity/history isolation and actual complete conversation.

## 3. Connection recovery

- [x] 3.1 Bound pre-ready retries, retain input and offer manual reconnection.
- [x] 3.2 Add optional host configuration callback to the widget and verify regressions.

## 4. History and feedback recovery

- [x] 4.1 Read current Codex response-item messages without duplicating legacy events or exposing startup instructions.
- [x] 4.2 Recover the existing user/page session and rerun idempotent feedback archival; verify consumer database visibility.

## 5. Mobile visibility recovery

- [x] 5.1 Persist opt-in host visibility without changing panel-close semantics or authentication.
- [x] 5.2 Add a touch-accessible restore action with loading and retry feedback.
- [x] 5.3 Verify persistence, storage failure, mobile/desktop recovery and build; reconcile documentation.

2026-10-02: 34 focused tests, frontend typecheck and isolated Vite build passed. Browser verified hide/reload/restore/panel-close and 390px viewport recovery using authorized frontend hot update. No SDK channel release or backend/Sidecar restart. User explicitly waived the legacy governance scan after INPUT_LIMIT (29,389 untracked paths against 1,000 limit); that checker is not reported as passed.
