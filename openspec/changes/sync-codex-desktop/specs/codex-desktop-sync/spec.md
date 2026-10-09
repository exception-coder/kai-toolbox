## ADDED Requirements

### Requirement: Read native projects and threads
The system SHALL read native project and persistent thread metadata through the selected Codex home's App Server with bounded cursor pagination, retaining native identities and real project roots.

#### Scenario: Read selected account
- **WHEN** an administrator opens Codex sync and selects an allowed authorization directory
- **THEN** project and thread queries use that directory and include interactive CLI, VS Code and App Server sources
- **AND** missing capabilities or failed queries remain explicit without starting model work

#### Scenario: Switch accounts
- **WHEN** the selected authorization directory changes
- **THEN** selection and pagination reset and stale responses cannot appear as the new account's results

#### Scenario: Older threads without native project membership
- **WHEN** a selected native project has roots but older threads have no project ID
- **THEN** the system reads native members followed by a separate exact-root directory-matching page stream
- **AND** directory matches are labeled explicitly and unrelated projects or directories cannot enter that stream

#### Scenario: Same project name or native ID prefix
- **WHEN** imported native projects have the same display name or time-based ID prefix, or belong to different authorization directories
- **THEN** their projected group names include a stable suffix derived from the full project and account identity

### Requirement: Import without duplicating or executing threads
The system SHALL import selected persistent threads into existing Forge sessions using the authorization directory and native thread ID as stable identity, without executing a turn or changing native desktop metadata.

#### Scenario: Repeat import
- **WHEN** the same threads are imported again or a request is retried
- **THEN** the existing Forge sessions are returned without duplicating sessions or overwriting their titles, favorites, configuration, ownership or running state

#### Scenario: Import another account
- **WHEN** different authorization directories contain the same native thread ID
- **THEN** their Forge sessions and history are kept separate

#### Scenario: Invalid import
- **WHEN** a preview expired, belongs to another user, includes an excluded or unavailable directory, or contains an unselected unknown thread ID
- **THEN** import is rejected before any selected session is inserted and the user can refresh the preview

### Requirement: Continue the original Codex session
The system SHALL preserve the native thread ID and authorization directory for existing history viewing and Codex resume.

#### Scenario: Open imported session
- **WHEN** the user chooses an imported session after stopping work in the desktop client
- **THEN** Forge selects the existing logical session and restores its Codex configuration and original native thread rather than creating a new thread
- **AND** importing alone never resumes the native thread
