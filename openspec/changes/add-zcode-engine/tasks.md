## Implementation

- [x] Confirm official CLI commands and event schema from pinned upstream source.
- [x] Add experimental identity, native CLI adapter, admission probe and existing UI projections.
- [x] Explicit permission mapping, restricted-policy rejection, exact-ID restore and terminal-result guards.
- [x] Finish targeted Sidecar, frontend and Java verification plus OpenSpec and Forge quality checks.
- [ ] Install/configure native CLI and model authorization, load the target version with explicit restart approval, then verify a real turn, resume and stop.

## Runtime boundary

Verification: 20 Sidecar tests, 23 frontend tests and 13 Java tests passed; Sidecar compilation, frontend typecheck, isolated Vite production build and strict OpenSpec validation passed. Forge quality returned PASSED (exit 0), with no static checkers executed and only API-RUNTIME-001 against the existing service; it does not validate the new ZCode runtime.

Local read-only probe returned dependencyMissing: no usable ZCode CLI in PATH and ZCODE_CLI_PATH unset. Registration is not runtime delivery. No automatic installation, credential copying, service restart or release.
