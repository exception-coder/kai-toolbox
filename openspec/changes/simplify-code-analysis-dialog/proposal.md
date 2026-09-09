## Why

The local code analysis dialog presents repeated progress figures, dense colored panels and 8–10px explanatory text. Users cannot quickly distinguish the result from configuration and follow-up actions.

## What Changes

- Present the requirement, implementation score and remaining effort first.
- Disclose detailed evidence, estimation basis and optional analysis settings on demand.
- Keep analysis and development actions in a stable footer, with accessible modal focus and readable responsive layout.

## Capabilities

### New Capabilities

- `code-analysis-dialog`: Focused presentation and recoverable interactions for existing code analysis.

### Modified Capabilities

None.

## Impact

ReqPoolCodeStage and a feature-local presentation component. Existing scoring, API requests, authorization and background task lifecycle remain authoritative. No server or database changes. Evidence: user feedback, targeted current source and existing design tokens; no unresolved business decisions.
