---
name: forge-openspec-continuous-execution
description: Keep a Forge-supervised OpenSpec change running until the bound Done Condition is proven.
x-forge-owned: true
x-forge-version: 1.0.3
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

### Database verification when Docker is unavailable

On Windows, do not start or restart Docker Desktop, Docker Engine, WSL, or a Testcontainers suite to clear a supervised task. Do not run a broad test command that implicitly starts Testcontainers. For migration work, first run compatible local checks with H2 `MODE=MySQL` when the project has H2, then run static migration numbering, packaging, and application wiring checks that do not require the target database. Record exactly which SQL ran on H2 and which target database checks remain. H2 verifies only its own compatibility behavior; it does not prove MySQL/MariaDB semantics, indexes, collation, or Flyway upgrade behavior on those engines. Do not retry an unavailable external database in a loop. If the current OpenSpec task explicitly requires target MySQL/MariaDB execution, leave that acceptance item open until a real target database is available or the specification owner explicitly changes the acceptance boundary.

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

- irreducible business ambiguity or a required product/architecture choice;
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
If a prior report put the run in `WAITING_USER` while this same turn is still active and there is no pending user decision, `CONTINUE` with concrete `nextAction` and `remainingWork` may recover it. Otherwise the API returns HTTP 409 with the current version and the explicit resume action. Never report a database check as passed or check the OpenSpec task until its required target database verification actually ran.
