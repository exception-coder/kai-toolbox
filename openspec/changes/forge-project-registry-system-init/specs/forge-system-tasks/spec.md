## ADDED Requirements

### Requirement: Tasks bind to a system
New registry tasks SHALL require a registered system and description, accept optional domain/context, and reuse the existing requirement pool through its registration port.

#### Scenario: Create system task
- **WHEN** the user creates a task under a registered system without selecting a module
- **THEN** Forge creates the requirement and atomically persists its system and profile-version binding

#### Scenario: Invalid system
- **WHEN** a task targets an unknown system
- **THEN** no task is created

### Requirement: Agent profile handoff
Forge SHALL expose task handoff context containing system identity, source root, bound profile version, evidence references and gaps.

#### Scenario: Uninitialized system
- **WHEN** a task is created before Full Init
- **THEN** the task is retained with an explicit uninitialized context and initialization recovery action
