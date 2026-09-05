## 1. Domain and Persistence

- [x] 1.1 Add `SessionAutopilotRun`, state, disposition and transition invariants with tests for enable, settled evaluation, continue, pause, resume generation, complete and stop.
- [x] 1.2 Add a versioned `OpenSpecExecutionContext` for project/repository/branch snapshot, change, human task key, apply ordinal, phase, Agent session, generation and workspace/change fingerprints, including drift invariants.
- [x] 1.3 Add idempotent claude-chat SQLite schema blocks and repository tests for one current run per session, Execution Context persistence, optimistic version control and unique run-generation-predecessor step records.
- [x] 1.4 Add bounded evidence serialization, deterministic continuation message IDs and no-progress fingerprints with size and duplicate tests.

## 2. Agent Skill and Sidecar Protocol

- [x] 2.1 Add one canonical, versioned `forge-openspec-continuous-execution` Skill asset with the no-premature-final, Done Condition, allowed-stop and structured-report contract, then atomically provision owned copies without editing OpenSpec-generated Skills or user-owned collisions.
- [x] 2.2 Report actual Continuous Execution Skill path, version and content fingerprint through existing capability snapshots; do not infer activation from file presence or prompt injection alone.
- [x] 2.3 Extend the session-bound Forge MCP implementations with `report_session_progress`, binding session, run generation, phase, current task and active turn on the server rather than trusting model input.
- [x] 2.4 Inject the active goal, Execution Context, remaining work, next action and progress-report contract into automatic turns for Claude SDK, Codex SDK fallback and Codex App Server.
- [x] 2.5 Add Sidecar protocol tests for every disposition, missing reports, stale generations, unsupported or mismatched Skill capability and safe-tool permission behavior.

## 3. Backend Supervision

- [x] 3.1 Publish a settled-turn application event only after `TurnLifecycle.finish` evidence is accepted, without changing ordinary user queue behavior.
- [x] 3.2 Implement `SessionAutopilotService` gates for fresh runtime state, pending decisions, background tasks, user queue priority, stop budgets and exactly-once continuation creation.
- [x] 3.3 Pause active automation atomically before manual send, steer or enqueue and test the relevant race boundaries.
- [x] 3.4 Implement startup and active-run reconciliation for running, unhandled terminal, duplicate terminal and unconfirmed recovery states.
- [x] 3.5 Implement `OpenSpecContinuousRunner` to resume an unchecked current task, persist the next task before dispatch, advance lifecycle phases, record Skill contract violations and reject context drift without parsing assistant prose.

## 4. Completion Evidence

- [x] 4.1 Implement OpenSpec change binding, remaining-task inspection and strict validation through bounded argv-based CLI calls.
- [x] 4.2 Implement an OpenSpec adapter over `status`, `instructions apply`, the returned `tasks.md` path and archive inputs; preserve both apply ordinal and human checklist key, keep OpenSpec as task SSOT and do not add a parallel task manifest.
- [x] 4.3 Implement `APPLY`, `VERIFY`, `QUALITY_GATE`, `STRICT_VALIDATE`, `ARCHIVE` and `DONE` phase transitions with bounded fix-and-retry behavior.
- [x] 4.4 Implement fingerprinted Forge Quality Gate evidence lookup or execution and reject stale successful evidence.
- [x] 4.5 Implement authorized rollback-capable archive handling and `OPEN_SPEC_STRICT` completion decisions with tests for complete, corrective continuation, approval-required, conflict and verifier-unavailable paths.

## 5. API and Event Contracts

- [x] 5.1 Add active-change discovery plus session autopilot read, configure and action HTTP endpoints with explicit project/change/archive-policy binding, Execution Context and bound-spec views, execution-policy checks, optimistic version conflicts and sanitized errors.
- [x] 5.2 Add a current-user-filtered dashboard projection and `GET /api/claude-chat/autopilot/runs` with scope, server-side search, stable cursor pagination, aggregate counts and snapshot timestamps.
- [x] 5.3 Add replace-semantics `autopilotState` snapshots plus sanitized `autopilotDashboardChanged` revision hints and reconnect tests without exposing stored evidence beyond the current user.
- [x] 5.4 Add repository integration tests for dashboard access filtering, stable pagination and indexed state/update-time queries; capture representative SQLite query-plan or latency evidence.
- [x] 5.5 Register all affected HTTP APIs with Forge after implementation and attach actual test or build evidence only for checks that ran.

## 6. Frontend Experience

- [x] 6.1 Add typed API/query ownership for autopilot server state and keep disclosure/form state local to focused claude-chat components.
- [x] 6.2 Add a compact “自动推进” entry, configuration layer and inline session status showing goal, bound change, budget use, evidence level and current phase.
- [x] 6.3 Add a focused OpenSpec binding detail panel showing project/branch snapshot, change, capability/spec paths, current task, task progress, phase, Skill activation, Runtime supervision, freshness and drift recovery.
- [x] 6.4 Add `/tools/claude-chat?view=supervision` as a first-class dashboard view with active, attention, paused and recent scopes, server-backed search, bounded pagination and snapshot freshness feedback.
- [x] 6.5 Implement compact desktop rows and mobile disclosure rows showing session/project, engine, goal or change, current task, phase, budget, progress, last activity and the applicable enter, pause, resume or stop actions.
- [x] 6.6 Invalidate dashboard queries from WebSocket revision hints, add visibility-aware fallback refetch, and handle empty, cached-stale, failure and optimistic-conflict recovery states.
- [x] 6.7 Add keyboard, focus-visible and narrow-screen tests, then visually verify bound, active, attention, paused, completed, empty, drifted and stale paths against the existing Quiet Luxury interface.

## 7. Verification and Rollout

- [x] 7.1 Run focused Sidecar tests, claude-chat Java tests and frontend component tests for the new state machine and contracts.
- [x] 7.2 Run frontend typecheck and production build, the relevant Maven module build, and `git diff --check`.
- [x] 7.3 Run `openspec validate session-autopilot --strict --json --no-interactive` and the engine-neutral Forge Quality Gate; record only actually executed checker evidence.
- [x] 7.4 Verify restart recovery and browser-offline continuation in a local runtime, then confirm rollback by disabling the feature with existing manual chat and queue flows intact.
- [x] 7.5 Run an end-to-end premature-stop scenario where the Agent ends with a pending current task, prove Runtime resumes the same Agent session without user input, then prove the final response is withheld until archive-confirmed `DONE`.
