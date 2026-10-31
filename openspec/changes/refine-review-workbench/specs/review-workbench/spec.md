## ADDED Requirements

### Requirement: Human-confirmed review backlog
The review workspace SHALL distinguish discussion candidates, explicitly added backlog entries and human-confirmed content revisions. AI SHALL NOT overwrite confirmed content or automatically submit unconfirmed requirements.

#### Scenario: Add, edit and merge
- **WHEN** a reviewer adds a candidate or explicitly edits or merges backlog entries
- **THEN** stable source identities SHALL prevent duplicate additions, existing evidence SHALL remain traceable, and changed content SHALL require confirmation again
- **AND** historical entries SHALL NOT be assumed confirmed

### Requirement: Unified durable delivery
The backlog SHALL provide the sole submission flow, showing the server-resolved target project and confirmed requirement summary. Submission SHALL atomically persist immutable delivery evidence and source-session todos, using stable requirement revisions for deduplication.

#### Scenario: Submit and retry
- **WHEN** the reviewer submits confirmed revisions or retries after a lost response
- **THEN** the server SHALL reject unconfirmed or stale revisions, preserve the backlog on failure and reuse the existing delivery on retry
- **AND** later edits SHALL form an explicitly new revision without overwriting submitted evidence or executing without source-session approval

### Requirement: Conversation-first mobile review
The review page SHALL use one compact header, a primary independently scrolling conversation, a discoverable compact backlog entry and a keyboard-safe composer. Details and backlog SHALL appear on demand.

#### Scenario: Open and close backlog
- **WHEN** a mobile reviewer opens and closes the backlog sheet while a task is running
- **THEN** discussion position, draft, attachment scope and running task SHALL remain unchanged, and focus SHALL return to the trigger
