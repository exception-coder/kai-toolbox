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

#### Scenario: Already imported threads in preview
- **WHEN** a preview includes threads already associated with Forge sessions
- **THEN** those rows are marked as imported with an open-session action and cannot be selected for another import
- **AND** bulk selection only includes available, not-yet-imported threads, and a fully imported page explicitly states that no further import is needed

#### Scenario: Confirmed import result
- **WHEN** import returns the created or reused Forge sessions
- **THEN** the dialog immediately shows import success and the actual added and reused counts, clears the selection and marks the confirmed threads as imported
- **AND** a slow or failed preview refresh does not undo the confirmed state or enable importing those threads again
- **AND** remaining available threads can still be selected, while changing accounts, projects or pages clears the current operation result

#### Scenario: Import another account
- **WHEN** different authorization directories contain the same native thread ID
- **THEN** their Forge sessions and history are kept separate

#### Scenario: Invalid import
- **WHEN** a preview expired, belongs to another user, includes an excluded or unavailable directory, or contains an unselected unknown thread ID
- **THEN** import is rejected before any selected session is inserted and the user can refresh the preview

### Requirement: Identify imported sessions without obscuring navigation
The system SHALL expose verified import origin in existing session lists and keep object actions from covering session titles on desktop and touch screens.

#### Scenario: Identify a session created by Codex sync
- **WHEN** persisted account, native thread and logical session identities match the Codex sync creation identity
- **THEN** the session list exposes and displays its Codex import origin, including older imports and sessions subsequently switched to another engine
- **AND** reused existing Forge sessions and missing or inconsistent identities are not mislabeled as newly imported

#### Scenario: Open session actions on a narrow screen
- **WHEN** the user browses the full or recent session list
- **THEN** titles, source and favorite state remain visible without an overlaid row of action icons
- **AND** one more-actions trigger opens labeled controls for that exact session, preserving confirmation, busy and running-state restrictions
- **AND** the popover stays within the viewport, supports scrolling and Escape with focus recovery, and copying an ID reports success or recoverable failure

### Requirement: Continue the original Codex session
The system SHALL preserve the native thread ID and authorization directory for existing history viewing and Codex resume.

#### Scenario: Open imported session
- **WHEN** the user chooses an imported session after stopping work in the desktop client
- **THEN** Forge selects the existing logical session and restores its Codex configuration and original native thread rather than creating a new thread
- **AND** importing alone never resumes the native thread
