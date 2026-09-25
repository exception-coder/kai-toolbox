## ADDED Requirements

### Requirement: Session-scoped engine provider overrides

Forge SHALL allow OpenCode sessions to use saved third-party providers through isolated child-process configuration without writing engine user settings or changing parent environment. Gateway model catalogs SHALL remain server-owned. Engines without an implemented session override adapter SHALL reject third-party configuration and engine switches that would silently ignore an existing gateway.

#### Scenario: Execute an OpenCode gateway turn

- **WHEN** a session has an explicit gateway address, Key and model
- **THEN** its owned runtime receives those values, validates effective routing before prompting, and closes after the turn or failure
- **AND** native default sessions keep their own configuration

#### Scenario: Select an unsupported engine

- **WHEN** a client attempts a gateway configuration on an unsupported engine
- **THEN** Forge rejects the operation and preserves the current session routing

#### Scenario: Recover model selection

- **WHEN** the gateway catalog is unavailable
- **THEN** the existing configuration panel supports manual model entry and catalog retry without substituting native models
