## ADDED Requirements

### Requirement: Discover a compatible native ZCode CLI
Forge SHALL expose ZCode as an experimental engine only after its native version and argument parser accept stream-json, explicit permissions, disabled workflows and resume options. Discovery SHALL NOT submit a model turn or copy authentication material.

#### Scenario: Runtime is absent or incompatible
- **WHEN** the CLI cannot be launched or its argument check fails
- **THEN** selection is refused and the existing engine menu offers a fresh detection action with the reason

### Requirement: Preserve execution and permission boundaries
Forge SHALL pass an explicit native mode, restore only its bound session ID and reject unsupported restricted policies or model overrides before spawning.

#### Scenario: Read-only product policy is requested
- **WHEN** tool policy is disabled, review-only or consult-readonly
- **THEN** no native process starts and Forge reports the unsupported boundary without substituting unrestricted execution

#### Scenario: Continue an owned native conversation
- **WHEN** a Forge session already has a ZCode native ID
- **THEN** the next turn uses that exact ID and never resumes an implicit latest conversation

### Requirement: Report terminal results conservatively
Forge SHALL translate native text and tool events into existing events. Success SHALL require a final result, matching native identity and successful process exit. Cancellation SHALL NOT publish success before the child exits.

#### Scenario: Process returns incomplete output
- **WHEN** a CLI exits without a final result, emits malformed events, changes identity or returns a nonzero exit
- **THEN** the round reports failure and partial text does not imply completion
