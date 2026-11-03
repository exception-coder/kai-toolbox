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
- **THEN** the sheet SHALL use the existing recent-session collection of up to twenty eligible sessions with real state labels, without truncating it to three
- **AND** at least five entries SHALL be available when enough sessions exist, with more entries reachable through the existing independently scrolling content region
- **AND** sheet height SHALL remain bounded by the available viewport, including short screens, keyboards and enlarged fonts
- **AND** switching SHALL use the existing draft-preserving switch operation
- **AND** full management SHALL remain accessible through the existing session board.


### Requirement: Discoverable session control entry
The mobile execution dock SHALL retain one 44px single-line button in idle, running, paused and error states, showing agent status, any queued count and an explicit “会话控制” action with an expansion arrow.

#### Scenario: Opening and closing from the dock
- **WHEN** the user activates any part of the dock by pointer or native keyboard activation
- **THEN** the existing session control sheet SHALL open without dispatching, clearing or changing sessions
- **AND** its accessible name, expanded state and arrow SHALL match the sheet state
- **AND** closing SHALL restore trigger focus without scrolling the conversation.

#### Scenario: First mobile discovery
- **WHEN** the entry has not been discovered in the current browser
- **THEN** a lightweight hint SHALL appear without adding a layout row or stealing focus
- **AND** it SHALL disappear after six seconds or opening the panel and SHALL NOT reappear after remount when storage is available.
