---
name: forge-openspec-continuous-execution
description: Keep a Forge-supervised OpenSpec change running until the bound Done Condition is proven.
x-forge-owned: true
x-forge-version: 1.0.0
---

# Forge OpenSpec Continuous Execution

This skill is active only when Forge injects an explicit supervised Execution Context. The bound OpenSpec change is the completion boundary for the run; a model turn or an individual task is not.

## Continuous execution policy

Do not stop and ask the user to say “continue” merely because one task, implementation phase, test command, verify pass, or other locally executable step ended. After every step:

1. Re-read the bound OpenSpec change using the project-provided OpenSpec skill or compatible CLI.
2. Work on the bound current task. Do not select another task from prose or memory.
3. If the task is checked and more tasks remain, continue with the next task selected by Forge.
4. If verification fails inside the authorized scope, fix it and retry within the injected budget.
5. Before yielding, call `forge.report_session_progress` exactly once with a truthful structured disposition.

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
- missing permission, credential, or external resource;
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
