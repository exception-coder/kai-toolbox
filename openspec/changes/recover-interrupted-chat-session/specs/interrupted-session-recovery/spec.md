## ADDED Requirements

### Requirement: Safely recover interrupted sessions

The system SHALL recover an interrupted session only after fresh runtime evidence confirms no active turn, pending decision or background work. Recovery and sending MUST be serialized per session and preserve native history.

#### Scenario: Send after interruption

- **WHEN** a user sends to a consistently interrupted session whose Sidecar is present and idle
- **THEN** the session becomes idle before the new message starts without replaying past messages

#### Scenario: Unsafe or unknown runtime

- **WHEN** the Sidecar is unavailable, stale, active, pending a decision or running background work
- **THEN** recovery and sending are rejected without clearing the existing state

#### Scenario: Concurrent reload and send

- **WHEN** reload and send arrive concurrently for one session
- **THEN** their state changes are serialized and reload cannot replace a newly active turn

#### Scenario: Native writer cleanup after interruption

- **WHEN** an interrupted Codex turn has produced a logical terminal event but its managed App Server process still holds the native thread writer
- **THEN** the system keeps the session non-sendable until the managed process exits and runtime state confirms the writer is released

#### Scenario: Interrupt reconciliation deadline

- **WHEN** the backend reconciliation deadline expires while Sidecar still reports the interrupted turn as active
- **THEN** the backend keeps the turn active and requests fresh runtime state instead of manufacturing a completed terminal state

#### Scenario: SDK terminal event without output EOF

- **WHEN** the Codex SDK fallback or gateway has delivered a successful or failed native terminal event but its output stream remains open
- **THEN** the adapter ends SDK iteration and confirms its owned native process has exited before publishing the settled result
- **AND** cancelling during cleanup changes an unpublished success to interrupted without releasing queued input

#### Scenario: SDK removes process listeners during cleanup

- **WHEN** SDK cleanup removes ChildProcess listeners before the adapter has confirmed native exit
- **THEN** the adapter rechecks recorded native exit properties instead of waiting indefinitely for a detached listener
- **AND** absent process ownership or unconfirmed exit cannot be reported as a successful turn or bypass the native writer barrier

### Requirement: Recovery guidance

The interface SHALL provide an explicit reload action for interrupted sessions and a recheck action when runtime state is unavailable or inconsistent.

#### Scenario: Interrupt remains unconfirmed

- **WHEN** interruption remains unconfirmed for 30 seconds
- **THEN** the interface restores the retry action and explains the pending cleanup without marking the turn idle or releasing queued input

#### Scenario: Repeated cancellation during protocol cleanup

- **WHEN** a user retries interruption while the owned Codex process is still cleaning up
- **THEN** the adapter can request cleanup of that same owned process and continues to require actual release evidence without affecting another session

#### Scenario: User cancels a buffered successful result

- **WHEN** a successful result is buffered but its execution has not returned and the user interrupts the matching turn
- **THEN** the eventual result is interrupted, retains usage, and cannot release the queue as success

#### Scenario: Interrupted status

- **WHEN** an interrupted session is displayed
- **THEN** the interface shows recovery guidance instead of claiming no correction is needed
