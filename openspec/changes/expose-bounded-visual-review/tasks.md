- [x] Inspect existing CLI, Forge bridges and official MCP tool contract.
- [x] Add bounded persistent job wrapper and SDK/stdio tool registration; keep restricted inventories unchanged.
- [x] Update frontend design guidance and architecture evidence flow.
- [x] Verify targeted CLI, tool inventory, cancellation and idempotency tests plus project quality checks.
- [ ] Load target version only with required restart authorization, then verify actual account upload, review and generated image.

No service restart, account login or screenshot upload performed during this change. Tests using local fixtures do not prove the real ChatGPT webpage workflow.

Verification: Sidecar TypeScript compilation passed; 11 targeted SDK/stdio, resource boundary, Codex MCP and tool tests passed. Original 8 CLI tests (including isolated Chrome) and 5 job tests passed. Strict OpenSpec validation passed. Forge all returned PASSED / exit 0, but executedCheckers was empty and API-RUNTIME-001 only tested the existing service /api/tools (200); no claim of new-tool runtime acceptance.
