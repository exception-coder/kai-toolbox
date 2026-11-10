## 1. Runtime

- [x] 1.1 Implement configuration, native tool execution and source/service preparation.
- [x] 1.2 Implement isolated PM2 lifecycle, v1 HTTP control and reload recovery.
- [x] 1.3 Replace old entry points and Java PowerShell launch dependencies.

## 2. Verification and documentation

- [x] 2.1 Verify real isolated PM2 startup, authentication, reload, crash recovery, stop and port conflicts.
- [x] 2.2 Verify Java restart tests and project quality gate; record actual executed checks.
- [x] 2.3 Update unified startup documentation, migration instructions and work log.

## 3. Evidence and acceptance boundaries

- [x] 3.1 Remove obsolete platform launchers and migration helpers; update active references and verify runtime regressions.

- Cleanup evidence: 13 obsolete scripts removed; active source references cleared, Task legacy aliases removed. Runtime 7/7, Task contracts 3/3, frontend typecheck and remaining 19 PowerShell scripts parsing under 5.1/7 pass. Forge verify exit 0/PASSED: 9 existing API scenarios; no static checkers executed. No running application was restarted.

- Startup UX follow-up: 7 Node test groups pass, including HTTP readiness before success, optional failure, timeout, real initial and repeated start. Live existing frontend HTTPS and backend HTTP probes passed; WeChat was reported separately as not ready. No running service was restarted for this UX change.

- Follow-up: stop/status detect unmanaged listeners instead of reporting success for an empty PM2 list. After the user's stop attempt, the verified legacy supervisor tree was stopped; ports 18080/5173/18081/9600/3000 were released. No new stack was automatically started.

- `node --test scripts/runtime/test/*.test.mjs`: 5 test groups pass, including real PM2 in separate Windows processes, Chinese/space paths, full reload via HTTP and CLI, controller crash recovery, owned-tree stop and port conflict protection.
- `scripts/tests/portable-startup.test.mjs`: 3 Task/Compose contract tests pass.
- Maven reactor test exit 0: RestartRuntimeTest 2, RestartRuntimePerformanceArgumentsTest 1, CandidateHandoffLauncherTest 4, SupervisorControlClientTest 5; 12 tests pass. Includes replacement JVM surviving parent JVM exit.
- Forge CLI verify: exit 0, JSON PASSED; executedCheckers empty, only 9 existing API-RUNTIME-001 scenarios executed. Those verify the existing server, not deployment of the new supervisor.
- `node forge.mjs doctor` exercises real native Java/Maven/npm/Git resolution on this Windows host. OpenSpec strict and git diff whitespace checks pass.
- macOS/Ubuntu/CentOS Stream and enabled optional third-party services still require real-machine acceptance. Existing live workspace supervisor was not switched during this change. Keep change available for that acceptance; no live deployment is claimed.
