## 1. Registry and initialization

- [x] 1.1 Implement persistent registration, canonical path validation and metadata updates.
- [x] 1.2 Implement single-run claim, ordered stages, failure/restart recovery and version publication.
- [x] 1.3 Implement bounded repository evidence discovery, Graphify integration and readiness/freshness evaluation.

## 2. Task integration and workspace

- [x] 2.1 Integrate existing requirement registration with atomic system/profile binding and Agent context.
- [x] 2.2 Replace workspace entry with responsive registry, registration and project detail flows.
- [x] 2.3 Expose initialization progress, evidence gaps, task launch and settings with recoverable states.

## 3. Verification and project initialization

- [x] 3.1 Verify registry, initialization and task contracts with real SQLite and focused tests.
- [x] 3.2 Run frontend tests, typecheck/build and Forge quality verification.
- [ ] 3.3 Inspect desktop/mobile browser flows. Blocked: browser tool reports user denied access to https://localhost:5173; no alternate browser or bypass attempted.
- [x] 3.4 Initialize the current Forge project through the new model and record actual readiness and remaining gaps.
- [ ] 3.5 Register affected API evidence. Attempt rejected by Forge tool with `user rejected MCP tool call`; local evidence retained, no alternate write attempted.

## 4. Evidence

- [x] 4.1 Consolidate local discovery, registration, directory settings and module workspace in the registry.
- [x] 4.2 Verify selection, configuration updates, compatibility routes and production build; deliver this consolidation independently.

- Consolidation (2026-09-09): 16 frontend tests passed across six files; production build including TypeScript and feature boundaries passed. Forge gate returned exit 0/PASSED, with no static checkers and nine existing API scenarios. No server contract or SQL changes. Previous browser denial remains respected; no browser acceptance claimed. Legacy project actions and configuration storage remain reused through public APIs.

- Backend: 14 tests passed (9 real SQLite/Spring transaction integration cases, 5 filesystem/Graphify discovery cases).
- Frontend: 17 related tests passed, typecheck and feature-boundary checks passed; final production build passed including metadata labels.
- Isolated HTTP checks: registration, metadata update, task registration/context; duplicate directory and concurrent init 409; missing system 404; invalid mode and sync-before-init 400. Evidence: `.codex-work/registry-api-evidence.json`.
- Forge gate: process exit 0, JSON PASSED; executedCheckers is empty, nine existing API-RUNTIME-001 scenarios passed. It did not validate the new registry APIs or UI.
- Current system registered as `9f900c09-62b6-42f0-a2cf-a10e00ed220f` in the normal local SQLite database. Initial profile v1 published with explicit source drift and graph gaps. Existing graph was preserved when Graphify extraction was stopped after host memory pressure.
- Final refresh uses manual SYNC after excluding runtime attachments and generated bundles. Its published status is recorded in `.codex-work/registry-forge-init-result.json`; graph freshness remains a real external evidence gap, not an invented successful extraction.
- No human-executed SQL script was produced: additive schema is owned by normal application startup. Forge DDL baseline returned PARTIAL for the four new tables; native SQLite tests passed but this does not update the knowledge baseline.
- Change remains active until browser acceptance and API ledger permission are resolved. Domain generation and automatic incremental graph synchronization remain phase two.
