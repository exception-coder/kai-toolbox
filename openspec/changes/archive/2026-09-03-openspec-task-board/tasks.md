## 1. OpenSpec Read Model

- [x] 1.1 Add version-aware DTO parsing for `context --json`, `list --json`, `status --change ... --json` and `instructions apply --change ... --json`, with fixtures covering malformed, partial and unsupported output.
- [x] 1.2 Extend the allowed-project boundary so board discovery reuses server-approved workspace/session roots and never executes OpenSpec against a client-provided arbitrary path.
- [x] 1.3 Implement project summary and selected-change aggregation with bounded CLI concurrency, command timeout handling, output limits and project-scoped failure isolation.
- [x] 1.4 Add short-lived, discardable snapshots with explicit snapshot time, freshness and targeted refresh semantics; do not persist a writable task copy.

## 2. Task State Projection

- [x] 2.1 Implement the base `TODO` and `DONE` mapping from OpenSpec task facts with deterministic ordering and section metadata.
- [x] 2.2 Define a focused Runtime evidence provider contract that can enrich incomplete tasks without making the board depend on `session-autopilot` availability.
- [x] 2.3 Map fresh explicit Runtime evidence to `IN_PROGRESS`, `IN_REVIEW` and `BLOCKED`, and reject stale or fingerprint-mismatched evidence with tests.
- [x] 2.4 Add aggregate project/change counts and attention reasons without inferring execution state from prose, timestamps or card position.

## 3. Read-Only HTTP Contracts

- [x] 3.1 Add the project board summary endpoint with stable project identifiers, active change summaries, aggregate counts, snapshot metadata and sanitized project-scoped errors.
- [x] 3.2 Add the selected-change detail endpoint with artifact references, structured tasks, projected states, Runtime summaries and freshness metadata.
- [x] 3.3 Add controller and service tests for authorization boundaries, invalid project/change identifiers, partial project failure, timeout, malformed CLI output and successful refresh.
- [x] 3.4 Register the affected HTTP APIs with Forge and attach only verification evidence from commands that actually ran.

## 4. Frontend Feature and Board Experience

- [x] 4.1 Create an independent `openspec-board` feature manifest, typed API/query boundary and public navigation contract without importing `delivery-center` internals.
- [x] 4.2 Implement the desktop workspace with project/change navigation, project overview cards, task-state columns and a focused artifact/task inspector.
- [x] 4.3 Implement search, project/change/state filters, filter reset, targeted refresh and snapshot freshness feedback.
- [x] 4.4 Implement narrow-screen project selection, state segmentation and single-column task disclosure with keyboard and focus-visible behavior.
- [x] 4.5 Implement recoverable loading, empty, not-initialized, CLI-unavailable, stale, partial-failure and error states with an applicable next action.
- [x] 4.6 Keep the first release read-only: expose artifact inspection, refresh and authorized session entry while omitting direct completion, archive and drag-to-mutate actions.

## 5. Verification and Rollout

- [x] 5.1 Add frontend tests for project overview, change selection, state grouping, filters, stale snapshots, partial errors and narrow-screen disclosure.
- [x] 5.2 Run focused Java tests, frontend tests, `npm run typecheck`, `npm run build` and `git diff --check`; record only checks that execute.
- [x] 5.3 Run `openspec validate openspec-task-board --strict --json --no-interactive` and the engine-neutral Forge Quality Gate.
- [x] 5.4 Visually verify populated, pending-only, Runtime-enriched, blocked, empty, stale, unavailable and mobile states against the project design profile.
- [x] 5.5 Verify rollback by removing the feature exposure and query endpoints while confirming existing OpenSpec initialization and delivery-center behavior remain intact.
- [x] 5.6 Resolve Forge Quality Gate from the server-bound repository identity when a supervised session starts in a nested project directory, with boundary regression tests.
