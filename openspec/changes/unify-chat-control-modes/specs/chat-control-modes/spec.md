## ADDED Requirements

### Requirement: Shared entry with isolated control modes
The workspace SHALL offer CODE_AGENT and LLM through a control-mode selector, preserving independent conversation identities and existing authorization.

#### Scenario: Default coding behavior
- **WHEN** a user opens the existing Vibe Coding route without a control mode
- **THEN** the original Code Agent workspace and execution capabilities remain available

#### Scenario: Pure model navigation
- **WHEN** a user follows the legacy AI chat entry or selects LLM
- **THEN** the pure model workspace opens without starting a previously inactive Code Agent runtime

#### Scenario: Return to previous mode
- **WHEN** a user switches modes while a conversation exists
- **THEN** the mode retains its own conversation and draft, no message or cancellation is dispatched by the switch, and histories are not merged

#### Scenario: Unauthorized mode
- **WHEN** a user lacks the existing permission for a selected mode
- **THEN** the workspace does not mount that mode and offers a permitted recovery path

### Requirement: Server-enforced pure model execution
The LLM completion endpoint MUST validate its control mode before persistence and MUST NOT advertise or execute model tools. The Code Agent backend SHALL remain a separate execution implementation.

#### Scenario: LLM request
- **WHEN** a completion request specifies LLM or omits controlMode for backward compatibility
- **THEN** the model receives messages and generation parameters without tools, and normal streaming, history, attachments and stop remain supported

#### Scenario: Wrong execution channel
- **WHEN** CODE_AGENT or an unknown mode is submitted to the LLM endpoint
- **THEN** it fails before saving messages or invoking a model

#### Scenario: Unsolicited tool request
- **WHEN** a model returns a tool invocation in pure LLM mode
- **THEN** the completion reports an explicit failure and no tool executes
