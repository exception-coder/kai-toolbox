## Implementation

- [x] Separate startup port recovery from the runner; preserve unknown processes and live dependencies/build output.
- [x] Gate AI startup on explicit port-conflict diagnostics without aborting the host.
- [x] Add parent-pipe shutdown, bounded asynchronous cleanup and absolute Java-owned entry arguments.
- [x] Refuse unknown listeners, serialize shutdown/start and retain unconfirmed child handles.
- [x] Synchronize runtime instructions and architecture lifecycle boundaries.

## Verification

- [x] Verify isolated Node/OS recovery, parent pipe termination and Java regression results; record exact checks below.
- [x] Verify affected TypeScript and complete backend host packaging without frontend rebuild.
- [x] Run strict specification validation and available Forge quality checks.
- [ ] After explicit restart approval, load the target version, inspect startup logs, exercise ordinary modules and AI, then observe process identity, restart counts and HTTP for at least 60 seconds.
- [ ] Confirm recovery on the colleague's machine; collect its complete controller/PM2 logs if controller failure persists.

No current Forge services have been restarted. Physical macOS/Linux lifecycle and legacy ambiguous-process automatic recovery are not certified.

## Evidence

- 30 targeted tests passed: 10 runtime/source/restart-scope tests, 4 parent-pipe/deadline/logging-pipe tests, 7 Java process-registry tests and 9 SDK-upgrade tests. The registry test starts a real Spring test context with the startup diagnostic bound, verifies context initialization, then confirms AI startup returns the diagnostic.
- Windows OS fixture used an isolated detached Node listener with a Chinese/space-containing absolute path and ephemeral port. After its parent exited, the listener remained alive; the real OS inventory identified it twice and the test confirmed exactly one termination request and released port. An earlier fixture without detachment did not establish recovery, so it was strengthened. The real run also exposed PowerShell output encoding and cold-query timeouts; final UTF-8/bounded-query path passed.
- Parent fixture exits without a shutdown hook; its child receives pipe closure and exits. Hung cleanup and repeated broken-output errors are separately covered. These are isolated process tests, not a restart of the live Forge or proof of the colleague's exact process tree.
- Complete Sidecar TypeScript emit into `.git/sidecar-lifecycle-build` passed without replacing the running `dist`. Complete `mvn -pl toolbox-starter -am package` passed with the two targeted Java suites and `skip.frontend=true`; no frontend rebuild was needed. Final class/JAR timestamps follow the source changes.
- OpenSpec strict passed; all 29 Mermaid blocks in the architecture document parsed. Forge full-phase JSON status PASSED with exit 0: static `executedCheckers=[]`, runtime only 9 existing API probes against the current services; not acceptance of the new lifecycle.
- Before/after read-only `node forge.mjs status` checks retain backend PID 12476, frontend PID 33796 and zero restart counts; auxiliary service identities were unchanged. Target-version HTTP, restart stability and colleague-site acceptance remain unchecked above.
