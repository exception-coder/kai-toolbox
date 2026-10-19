## Implementation
- [x] Inspect existing recovery, ownership, draft, workflow and resource boundaries.
- [x] Implement desktop conversation workspace, own recent recovery, explicit new/continue and nonblocking date reminder.
- [x] Implement bounded source references, current workflow assembly and idempotent continuation creation.
- [x] Verify frontend targeted cases, typecheck and feature boundaries.
- [x] Verify Java ownership, replay, excerpt SQL and host assembly.
- [x] Finish temporary-output Vite production bundling.
- [x] Complete quality gate and scoped delivery review; commit/push evidence is the actual Git record.

## Verification evidence (2026-10-19)
- Frontend: 21 page recovery/navigation cases plus 9 date, request identity and announcement cases passed. Typecheck exit 0; 60 menu permissions and feature boundaries passed, no new private imports.
- Java: 32 targeted cases across access, continuation, session HTTP and source routing passed. The new HTTP fixture initially lacked GlobalExceptionHandler; it was corrected and its two cases passed on rerun. The other 30 successful cases had unchanged inputs and were reused. Real SQLite exercised bounded excerpts and session filtering; a locked historical native-library cleanup warning did not prevent these cases passing.
- Host: all 41 reactor modules packaged with `-Dskip.frontend=true -DskipTests`, exit 0. This verifies host assembly, not a new application startup or frontend embedding.
- Quality CLI: JSON status PASSED, process exit 0; executedCheckers is empty, and nine existing API runtime probes passed. These probes do not cover the new consultation endpoints or new model session.
- Frontend output stays in TEMP and does not publish the Assistant SDK or replace the running frontend. The first build was stopped under memory pressure; the 2048 MiB attempt exhausted its heap. The final build passed in 5m11s with 6423 transformed modules, a 3072 MiB heap, no minification and no compressed-size report.
- Read-only managed status: backend/frontend and enabled auxiliary services ready, restart counts 0. No service restart or deployment was initiated. New target runtime smoke, model continuity and stability observation remain pending below.

## Pending runtime acceptance
- [ ] Real desktop browser, keyboard, focus and long/short-height review (browser access unavailable in this session).
- [ ] New target backend deployment, actual model continuation, HTTP smoke and 60-second stability observation after fresh user restart confirmation.
