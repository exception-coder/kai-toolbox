## ADDED Requirements

### Requirement: Public injectable one-shot capability

The host SHALL expose the existing AgentOneShotRunner as a Spring Bean to tool modules depending on toolbox-llm, with simple text execution and named request construction.

#### Scenario: Default text execution
- **WHEN** a caller submits a nonblank prompt through the simple public method
- **THEN** the implementation dispatches one Claude task with tools disabled and returns the complete text without creating a platform persistent chat

#### Scenario: Explicit engine and model
- **WHEN** a caller builds a text request selecting a supported engine and model
- **THEN** the implementation forwards those choices with tools disabled and returns the collected result

#### Scenario: Streaming text
- **WHEN** a caller supplies a delta callback
- **THEN** each text delta reaches that callback and the method returns the complete text on completion

### Requirement: Explicit support and failure boundaries

The capability SHALL declare implemented one-shot engines and reject invalid requests before starting the runtime. The host implementation SHALL declare Claude and Codex only; declaration MUST NOT be treated as an authentication or readiness probe.

#### Scenario: Unsupported engine
- **WHEN** a caller requests OpenCode or an unknown engine
- **THEN** the call fails explicitly before Sidecar startup without silently choosing another engine

#### Scenario: Empty input
- **WHEN** the request or its user prompt is null or blank
- **THEN** the call fails before runtime startup and leaves no active call

#### Scenario: Runtime failure
- **WHEN** the runtime returns an error
- **THEN** the caller receives a failure and the active call is cleaned up without automatic replay

#### Scenario: Existing callers
- **WHEN** a caller uses an existing overload or ExecutionRequest constructor
- **THEN** those entry points remain available and preserve advanced execution configuration
