## 1. Delivery slice

- [x] 1.1 Replace separate Git navigation with project-bound dialog and legacy-link recovery.
- [x] 1.2 Add structured project philosophy, design reference and routing with scoped evidence.
- [x] 1.3 Verify selected-object isolation, dismissal/focus, list preservation, push/error behavior and responsive UI.
- [x] 1.4 Run build and quality gate, observe runtime for 60 seconds, update documentation and commit only this scope.

## Verification evidence (2026-09-13)

- Git interaction regression: 2 files / 9 tests passed after correcting the fixture to match RegistryProject required fields. Covers lazy loading, selected-project identity, list search and focus restoration, pending-push dismissal protection, read errors, push success/failure and legacy navigation.
- Real browser: https://localhost:5173 in existing development mode, backend http://localhost:18080. The project row opens Forge Git state for the selected registry identity; no duplicate project selector or top-level Git tab remains. Escape restores the trigger and retains the Forge search. Keyboard focus stays inside the modal.
- Responsive review: desktop and 375 × 900 viewport. Modal width 343 px, left inset 16 px, scrollWidth/clientWidth both 341 px; long paths wrap, body scrolls and header close remains reachable. Browser error log empty. No real push was executed.
- Forge full verification: exit 0, JSON status PASSED; nine API-RUNTIME-001 runtime scenarios passed. Static stage reported PASSED with executedCheckers=[]; no static checker is claimed as executed.
- OpenSpec strict validation and local Markdown link validation passed. Project design binding and local preference evidence passed their JSON schemas; the shared candidate profile was not promoted.
- Full frontend build passed with exit 0, including TypeScript, package builds and feature boundaries. Existing bundle-size warnings remain; no threshold was relaxed. No Java implementation changed and no backend restart was needed; runtime acceptance uses the updated Vite development source, not an embedded fat-jar release.
- Stable observation 00:34–00:37 local time exceeded 180 seconds: backend wrapper PID 56924 / Java PID 8428, frontend PID 46980, restart counts stayed 0, both ready; HTTP /api/tools remained 200 and Git data rendered successfully. No fatal startup failure appeared in reviewed service logs. Pre-existing WeChat waiting-restart state (count 4) is outside this delivery scope.
- Scoped local commit includes only this change; AGENTS routing is staged separately from the existing application/OpenSpec hunk. No remote push.
