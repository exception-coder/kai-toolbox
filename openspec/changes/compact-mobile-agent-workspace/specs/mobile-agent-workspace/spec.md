## ADDED Requirements

### Requirement: Mobile conversation prioritizes messages
The mobile conversation SHALL allocate remaining workspace height to messages and present runtime controls through a compact Agent Dock.

#### Scenario: Running with queued work
- **WHEN** the mobile conversation is running and has queued messages
- **THEN** one dock displays runtime state and queue count, with queue details and OpenSpec controls available in a bottom sheet
- **AND** the full queue and supervision bars are not persistently expanded above or below messages

#### Scenario: Global assistant launcher is available
- **WHEN** the mobile conversation shows its default composer
- **THEN** the global assistant launcher remains accessible above the dock without covering the stop and send controls

#### Scenario: Abnormal completion pauses queue
- **WHEN** queued work is paused after abnormal completion
- **THEN** the dock displays that the queue is paused and preserves the existing explicit recovery actions

### Requirement: Mobile send actions preserve execution intent
Mobile users SHALL explicitly choose the applicable running send mode without interrupting work merely by opening controls.

#### Scenario: Choose running message action
- **WHEN** a user opens the running send selector
- **THEN** no message is sent until an action is selected
- **AND** enqueue is the default action and steering is offered only for supported official Codex sessions without attachments

### Requirement: Voice disclosure preserves call identity
Idle native voice SHALL be discoverable in the dock without a persistent mobile control row, while active and recoverable calls remain visible.

#### Scenario: Switch away from a connected voice session
- **WHEN** a connected voice session is replaced by another session
- **THEN** old media is released and its recovery hint remains associated only with the original session
- **AND** closing a dock does not unmount or stop the call
