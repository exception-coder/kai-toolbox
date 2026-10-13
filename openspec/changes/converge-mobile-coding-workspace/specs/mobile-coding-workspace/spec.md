## ADDED Requirements

### Requirement: Conversation first on mobile
The coding workspace SHALL prioritize conversation content on mobile with flat assistant messages, compact controls and one normal execution summary next to the composer. Complete tool events, metrics, queue and supervision capabilities SHALL remain accessible on demand.

#### Scenario: Routine execution
- **WHEN** the current agent is executing tools and changing files
- **THEN** routine activity cards are consolidated into Agent Dock details without deleting their underlying events
- **AND** warnings, errors and required user decisions remain visible

#### Scenario: Inspect execution and return
- **WHEN** the user opens and closes Dock details
- **THEN** current execution, queue, metrics and record inspection are available without losing the session, draft or message scroll position

### Requirement: Distinguish current execution from ended turns
The interface SHALL distinguish current execution from an ended turn's result and SHALL hide detailed token/cache/timing metrics behind explicit controls on mobile.

#### Scenario: Previous turn completed while next turn runs
- **WHEN** a completed result precedes current running activities
- **THEN** the historical result describes that specific turn while the Dock continues to show current execution

### Requirement: Recoverable compact controls
The interface SHALL retain stop, send, attachments, configuration and supervision access with reachable touch controls, bounded input growth and a primary conversation scroll container.

#### Scenario: Mobile and short viewport
- **WHEN** the user opens a normal conversation on a narrow or short viewport
- **THEN** normal supervision and record statistics do not form extra permanent bars
- **AND** the input and current state remain visible without scrolling the page
