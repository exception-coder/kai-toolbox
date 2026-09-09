## Context

PrdProgressEvaluationService already resolves the latest source revision and its LocalProjectResolver location. OpenSpecProgressContextResolver only accepts a textual explicit binding. The analysis dialog owns that binding as free text.

## Decisions

- Add a read-only session endpoint through the existing PRD facade, reusing revision and project resolution. Do not accept a filesystem path from the browser.
- Extend the existing resolver with bounded, direct-child discovery of openspec/changes, excluding archive and requiring readable tasks.md. Validate real-path containment and cap candidates/task size. No graph or parallel knowledge store is created.
- Auto-select only a unique eligible candidate; multiple candidates require an explicit selection. Analysis resolves the current filesystem again, so a removed selection cannot silently bind another change.
- Show project discovery above optional settings, with loading, retry and missing-project/empty guidance. Loading or ambiguous discovery blocks analysis. Selection remains local to the requirement; no persisted association is introduced.
- The existing INSUFFICIENT code-evidence barrier remains unchanged. Finding tasks does not establish implementation correctness.

## Risks / Trade-offs

Only standard task-plan changes are offered. Archived/missing-task changes are not candidates. Filesystem changes between discovery and evaluation remain possible and must produce explicit context failure, not substitute another candidate. Backend tests cover containment, selection and bounded reads; frontend tests cover default selection, ambiguity and retries.

## Migration Plan

Deploy backend and frontend together. Existing explicit extraContext bindings remain supported. No database migration.

## Open Questions

None. Browser visual acceptance is still pending previously denied access.
