## ADDED Requirements

### Requirement: Desktop consultation opens the latest owned conversation
The system SHALL open the latest owned consultation on desktop, preserve archived read-only state, and expose new, history and graph actions without requiring graph selection.

#### Scenario: Administrator returns to consultation
- **WHEN** an administrator opens the desktop consultation workspace
- **THEN** only that administrator's latest consultation is restored, while the existing administrative history list remains available

### Requirement: New drafts preserve existing conversations
The system SHALL preserve the original consultation and its follow-up draft while preparing an independent new question.

#### Scenario: User returns from a new draft
- **WHEN** a user opens a new draft and returns to the current consultation
- **THEN** no original consultation is archived or cancelled and its draft is retained

### Requirement: Previous-day sessions offer nonblocking continuation
The system SHALL use Asia/Shanghai calendar dates to recommend new sessions for previous-day consultations, allowing the user to continue unchanged or create a new session with a source reference.

#### Scenario: Continuation starts with bounded context
- **WHEN** the owner explicitly sends a new question using continuation
- **THEN** the service creates a separate consultation with at most six bounded visible question-answer excerpts, a durable source reference, and freshly selected workflow permissions

#### Scenario: Retry does not duplicate the new session
- **WHEN** the same source and request fingerprint are retried with the same target UUID
- **THEN** the existing new consultation is returned and its workflow or runtime binding is not replaced

#### Scenario: Source is unavailable or belongs to another user
- **WHEN** a user attempts continuation without accessible owned source content
- **THEN** the service rejects the request without creating a new consultation and the UI preserves the draft for recovery

### Requirement: Desktop panels retain canvas context and theme
The system SHALL open desktop conversations in a bounded panel by default, expose explicit expansion and restoration, and use the active theme for its composer. Graph settings SHALL appear only in the optional vertical more menu, with a single graph return action.

#### Scenario: Default panel and settings recovery
- **WHEN** a user opens a desktop consultation
- **THEN** the panel leaves visible canvas space and follows the page theme, without a fixed white composer
- **AND** expanding or restoring preserves the mounted conversation and drafts
- **WHEN** the user opens more settings and presses Escape
- **THEN** the single settings menu closes and focus returns to its trigger
