## ADDED Requirements

### Requirement: Progressive session controls
The session control sheet SHALL prioritize the queue summary, equal-level available shortcuts and compact storage information, with recent sessions and execution details disclosed separately.

#### Scenario: Default opening
- **WHEN** a user opens the control sheet
- **THEN** its title SHALL be “会话控制” and its mobile height SHALL fit content within 60% of the visible viewport
- **AND** opening SHALL NOT dispatch messages, clear the queue or change the current session
- **AND** the user SHALL be able to expand it to 90% or swipe its handle down to close.

#### Scenario: Queue management
- **WHEN** the user expands queued messages
- **THEN** each item's delivery state SHALL retain its existing backend meaning and existing removal protections
- **AND** bulk clearing SHALL require confirmation from a secondary entry
- **AND** a changed queue or closed panel SHALL invalidate that pending clear operation.

#### Scenario: Recent sessions
- **WHEN** the user selects the recent-session view
- **THEN** the sheet SHALL query existing session data and show at most three eligible recent sessions with real state labels
- **AND** switching SHALL use the existing draft-preserving switch operation
- **AND** full management SHALL remain accessible through the existing session board.
