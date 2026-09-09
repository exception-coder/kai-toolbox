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

### Requirement: Recovery guidance

The interface SHALL provide an explicit reload action for interrupted sessions and a recheck action when runtime state is unavailable or inconsistent.

#### Scenario: Interrupted status

- **WHEN** an interrupted session is displayed
- **THEN** the interface shows recovery guidance instead of claiming no correction is needed
