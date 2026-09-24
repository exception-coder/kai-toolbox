## ADDED Requirements

### Requirement: OpenCode completion preserves assistant output

Forge SHALL reconcile OpenCode's completed prompt response with streamed assistant text before marking a turn successful, and SHALL report an explicit error when no assistant text is returned.

#### Scenario: Event stream misses an assistant message

- **WHEN** the prompt response contains assistant text that was not emitted through the event stream
- **THEN** Forge emits the missing text once before the terminal success event

#### Scenario: Event stream already delivered the text

- **WHEN** the prompt response repeats assistant text already emitted through the event stream
- **THEN** Forge does not duplicate the text

#### Scenario: Prompt ends without assistant text

- **WHEN** OpenCode returns a successful prompt response without assistant text
- **THEN** Forge reports a recoverable empty-response error instead of a successful turn

### Requirement: OpenCode session offers model selection

Forge SHALL expose the connected OpenCode models and a default-model option in the existing session configuration, with a refresh action and an actionable empty-catalog message.

#### Scenario: User selects a connected model

- **WHEN** the current session uses OpenCode and the model catalog is available
- **THEN** the user can select a model without leaving that session
