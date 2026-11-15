- [x] Inspect official Hermes ACP source and existing engine contract.
- [x] Implement experimental adapter, runtime probe, exact restore, permissions and unknown-turn guard.
- [x] Add backend/frontend identities, unified entry and native configuration boundaries.
- [x] Verify targeted Sidecar, frontend, Java, production build, OpenSpec and Forge quality checks.
- [ ] Install/configure native Hermes ACP and account; load target version only with explicit restart approval; verify actual reply, restore, approval and stop.

No installation, authentication, service restart or deployment performed. Fixture tests do not prove real Hermes account/runtime readiness.

Verification: 23 Sidecar tests, 26 frontend tests and 14 Java tests passed. Sidecar TypeScript compilation, frontend typecheck, isolated Vite production build (dist/hermes-validation) and strict OpenSpec validation passed. Forge all returned PASSED / exit 0; executedCheckers was empty and the only runtime verifier API-RUNTIME-001 queried the existing service /api/tools (200), not the new engine. Local native probe returned dependencyMissing. Desktop/phone preview entries were prepared as WAITING_VIEWER_AUTH; no real browser acceptance or loaded-version verification was performed.
