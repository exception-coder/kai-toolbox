## ADDED Requirements

### Requirement: Persistent review handoff
Submitting review requirements SHALL atomically register versioned pending tasks in their source session, without starting coding. Repeated submissions SHALL reuse existing task identities. Public callers SHALL only submit current requirements of their own review space and SHALL NOT approve execution or choose another source session.

#### Scenario: Submit and revise
- **WHEN** a reviewer submits a requirement list or an updated requirement
- **THEN** source-session tasks SHALL retain source and revision, repeated entries SHALL be deduplicated, and already approved task text SHALL remain immutable
- **AND** changes to waiting revisions SHALL be explicit rather than silently replacing execution history

### Requirement: Source-session approval
Only an authorized source-session user SHALL edit waiting task text and confirm selected tasks for execution, optionally merging them. Confirmation SHALL durably associate tasks and queue messages in one transaction and reject stale versions or restricted execution policies.

#### Scenario: Confirm during a running turn or after restart
- **WHEN** the source user confirms selected tasks
- **THEN** queued tasks SHALL survive browser closure and restart, preserve existing work and execution order, and not be duplicated by confirmation retry
- **AND** the existing scheduler SHALL start only after authoritative idle and execution admission checks

### Requirement: Evidence-based review progress
Source and public review pages SHALL show handoff, queued, running, completed and exceptional outcomes from persisted execution receipts. Unknown outcomes SHALL NOT be marked complete. Public review conversation SHALL NOT issue development steering or settings commands.

#### Scenario: Failure and recovery
- **WHEN** execution is unconfirmed, interrupted or repeatedly fails completion checks
- **THEN** tasks SHALL remain exceptional or checking until existing recovery or explicit user confirmation supplies evidence
- **AND** dismissing an unstarted queue item SHALL return its tasks to waiting without replaying old receipts
