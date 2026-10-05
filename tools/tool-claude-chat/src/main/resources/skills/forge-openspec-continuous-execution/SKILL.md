---
name: forge-openspec-continuous-execution
description: Keep a Forge-supervised OpenSpec change running until the bound Done Condition is proven.
x-forge-owned: true
x-forge-version: 1.0.7
---

# Forge OpenSpec Continuous Execution

This skill is active only when Forge injects an explicit supervised Execution Context. The bound OpenSpec change is the completion boundary for the run; a model turn or an individual task is not.

The Forge Runtime supervision binding and the Sidecar code writer binding are separate. The injected Runtime run ID, change ID, phase and task come from the current session's persisted supervision record. A `null` value in `forge.session_init.execution` means no code writer has been granted for that session; it does not erase the supervised OpenSpec binding. Before editing, determine exact files for the bound task and follow `resolve_execution_context` → `discover_execution` → `assess_execution`, reusing the bound change ID. Respect the writer decision. If that path cannot grant access, inspect the writer owner and continue independent read-only or nonconflicting work. Report the specific blocker only when no authorized step remains.

## Continuous execution policy

Do not stop and ask the user to say “continue” merely because one task, implementation phase, test command, verify pass, or other locally executable step ended. After every step:

1. Re-read the bound OpenSpec change using the project-provided OpenSpec skill or compatible CLI.
2. Work on the bound current task. Do not select another task from prose or memory.
3. If the task is checked and more tasks remain, continue with the next task selected by Forge.
4. If verification fails inside the authorized scope, fix it and retry within the injected budget. If an external verification environment is unavailable, keep that check unfinished in `remainingWork`, state that SQL was not executed, and continue steps that do not depend on it. Revisit the check before marking the task complete.
5. Before yielding, call `forge.report_session_progress` exactly once with a truthful structured disposition.

For a multi-change batch, finish every safe step in the current change first. If a concrete prerequisite or unanswered decision still blocks it, report `WAITING_USER` with the exact question and evidence. Forge may preserve that question and dispatch another selected change after revision and strict-validation checks. Do not switch change IDs yourself, mark the blocked task complete, merge another change's files into the current commit, or repeat the same blocked step. When every selected change is deferred, wait for the user's answer; resume the original run to revisit the recorded questions.

When a fact or product detail is uncertain, first look for a conservative, reversible local implementation that meets the confirmed goal without pretending the unknown is verified. Choose the recommended option yourself when its effects can be bounded and locally tested. Record the question, evidence, chosen assumption, rejected alternatives, risk, tests, and the condition for revisiting the choice in the change's existing design or validation record. Split any mixed task: keep implementation and local tests in the development task, and add an unchecked task beginning `[MANUAL_CONFIRMATION] ` for later owner verification and correction. Then report `CONTINUE` with the next implementation step. For source identifiers, history completeness, permissions, and data changes, do not silently assume an unverified property: use reconciliation, collision detection, fail-closed behavior, or another explicit fallback where applicable. Check off the development task once its explicit local acceptance conditions pass; the confirmation task stays unchecked. Reserve `WAITING_USER` for a decision with no safe provisional path, an irreversible operation, or a required authorization; do not treat every question for the owner as a stop signal.

During a supervised run, treat the confirmed OpenSpec goal as the completion boundary. A repository's ordinary one-task-one-commit convention does not require you to stop at every task or to commit a partial, dependency-incomplete snapshot. If a shared prerequisite or another writer's uncommitted work prevents an isolated commit, record the exact dependency and owner, keep the affected task and verification open, and continue other authorized steps or a Runtime-dispatched selected change. Report `WAITING_USER` only after those steps are exhausted or a real user decision is required; a missing per-task commit alone is not such a decision. At a coherent verified checkpoint, commit only files owned by the current writer and supported by current verification. Do not stage another writer's work, bypass file-scope checks, claim a mixed or unverified commit as delivery, or infer permission to restart or publish.

### Container-free database verification

During supervised work, do not start or restart Docker Desktop, Docker Engine, WSL, or a Testcontainers suite to clear a supervised task. Do not run a broad test command that implicitly starts Testcontainers. For migration work, first execute compatible local migrations on H2 `MODE=MySQL` when the project has H2, then run static migration numbering, packaging, targeted application tests, and wiring checks that do not require the target database. Record exactly which SQL ran on H2 and which target database checks remain. H2 verifies only its own compatibility behavior; it does not prove MySQL/MariaDB semantics, indexes, collation, or Flyway upgrade behavior on those engines. Do not retry an unavailable external database in a loop. If the OpenSpec development task does not explicitly require target MySQL/MariaDB execution, sufficient local evidence can complete that task; record real target migration and upgrade checks as not executed with a pre-release follow-up in validation evidence. If the task explicitly requires target execution, leave that acceptance item open until a real target database is available or the specification owner changes the boundary. Never claim release readiness from H2 checks.

When the same task is dispatched repeatedly, review its explicit development acceptance conditions before adding another slice. Check off a task once its required local implementation and applicable regression tests pass. If its specification does not require production deployment or target environment validation at this stage, record missing production wiring, scheduler activation, and target database evidence as follow-up work instead of using them alone to keep the development task open. Name any remaining required local code or test precisely and implement it; do not extend the task indefinitely with optional enhancements. An interface draft or test stub is not sufficient when the task explicitly requires working local implementation. Never claim the deployed integration or release validation has passed without evidence.

The supervised development order is: implement code, pass applicable local baseline tests, close development tasks, then prepare one final production validation and manual operation checklist. Production deployment, real database migration and upgrade checks, and production scheduler activation belong to that final handoff. Do not perform production operations during automatic development or keep a locally accepted development task open solely because those checks have not run. If an older OpenSpec task mixes local acceptance with production validation, update its task boundary under the project's specification rules and preserve each production item as explicitly not executed. Do not check off missing local implementation or describe a development-complete run as production verified or released.

Mark a production-only OpenSpec task by starting its task description with the exact token `[MANUAL_PRODUCTION]`. Split a mixed task into a locally verifiable development task and a marked manual production task before closing the development work. Forge dispatches remaining development tasks past marked tasks, then runs the local quality gate and strict validation. If marked tasks remain, Forge stops at `PRODUCTION_HANDOFF_REQUIRED` and does not automatically check them off or archive the change. Never add this marker to unfinished local code or tests merely to bypass a blocker.

Use `[MANUAL_CONFIRMATION]` for the deferred verification of a provisional design assumption. It follows the same dispatch and final handoff behavior as `[MANUAL_PRODUCTION]`: Forge skips the confirmation task during local development, lists it at handoff, and does not automatically mark it done or archive. This marker never excuses incomplete local implementation, untested fallback behavior, or an assumption falsely recorded as verified.

Never describe the whole goal as complete while Forge says a task or lifecycle phase remains. Phrases such as “下一阶段可以继续” and “后续可以做” are not valid completion outcomes; execute that next step or report why it cannot run.

## Done Condition

In `OPEN_SPEC_STRICT` mode, report `COMPLETE` only when the current injected phase has passed. Only Forge Runtime may declare the whole run done after it independently confirms:

- every OpenSpec task is checked;
- implementation verification passed;
- the Forge Quality Gate passed for the current workspace fingerprint;
- OpenSpec strict validation passed;
- the change was archived when the run policy authorizes archive;
- no executable work remains inside the bound change.

## Allowed stop conditions

Use `WAITING_USER` or `BLOCKED`, with a concrete reason, only for:

- business ambiguity or a product/architecture choice with no safe reversible provisional path;
- missing permission, credential, or external resource after all independent authorized steps are exhausted;
- irreversible or high-risk action not already authorized by the run policy;
- conflicting OpenSpec requirements;
- exhausted retry, time, turn, or no-progress budget.

Questions, approval requests, background tasks, manual user input, and Forge pause/stop always take priority over automatic continuation.

## Progress report contract

Call `forge.report_session_progress` with:

- `disposition`: `CONTINUE`, `COMPLETE`, `WAITING_USER`, `BLOCKED`, or `FAILED`;
- `summary`: bounded summary of work performed;
- `nextAction`: required for `CONTINUE`;
- `remainingWork`: concise unfinished items;
- `evidence`: commands or artifact paths, without credentials or full raw tool output;
- `reason`: required for `WAITING_USER`, `BLOCKED`, or `FAILED`.

The tool records a candidate report only. It does not grant authority, start a turn, or mark the run complete.
If a prior report put the run in `WAITING_USER` while this same turn is still active and there is no pending user decision, `CONTINUE` with concrete `nextAction` and `remainingWork` may recover it. Otherwise the API returns HTTP 409 with the current version and the explicit resume action. Never report a target database check as passed until it actually ran. Check the development task against its explicit acceptance condition, and preserve missing target evidence as a pre-release follow-up when target execution is not required by that task.
