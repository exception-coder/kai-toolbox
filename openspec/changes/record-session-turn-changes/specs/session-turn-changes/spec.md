## ADDED Requirements

### Requirement: Persist bounded observations per platform turn
The system SHALL persist a Git baseline before dispatch and a file change observation when a turn settles, keyed by sessionId and platform turnId. Repeated terminal events SHALL NOT replace the snapshot.

#### Scenario: Existing dirty files and new committed changes
- **WHEN** an existing dirty file remains unchanged while another file is edited and committed during a turn
- **THEN** the existing dirty file is excluded and the committed path is recorded with Git endpoints

#### Scenario: Partial capture or missing terminal
- **WHEN** Git is unavailable, limits are exceeded, or no terminal event is received
- **THEN** the record explicitly reports partial capture or an unsettled baseline and does not claim a complete empty change list

### Requirement: Search within the current session
The system SHALL offer paginated read-only file and turn search within the current session and a per-turn entry for new realtime results.

#### Scenario: Shared workspace and historical sessions
- **WHEN** users inspect a turn observation or search old history
- **THEN** the UI states that shared workspace changes are not exclusive contributions, and never fabricates historical records without a baseline

#### Scenario: Query failure and mobile recovery
- **WHEN** retrieval fails or the screen is narrow
- **THEN** the UI provides retry, bounded scrolling, keyboard close and focus recovery without modifying the session draft
