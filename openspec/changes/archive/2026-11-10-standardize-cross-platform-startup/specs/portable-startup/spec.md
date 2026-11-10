## ADDED Requirements

### Requirement: Shared command catalog
The project SHALL provide one Task v3 definition for dependency checks, preparation, native development and packaging on Windows, macOS and supported Linux systems.

#### Scenario: Foreground development
- **WHEN** a developer invokes native development after preparation
- **THEN** standard Maven and npm processes run in the foreground without port-killing or a custom supervisor
- **AND** source auto-update is disabled for that process path

### Requirement: Explicit lifecycle ownership
The project SHALL retain the existing supervised start commands for current Windows/macOS restart and update compatibility and SHALL NOT advertise Linux supervisor compatibility through those wrappers.

#### Scenario: Optional observability
- **WHEN** a developer opts into Phoenix Compose with an explicit image reference
- **THEN** Compose manages its lifecycle with loopback networking and a persistent volume
- **AND** normal stop does not delete the volume or stop legacy containers

### Requirement: Honest platform readiness
Documentation SHALL distinguish portable command definitions from actual runtime verification and SHALL state environment, config and restart limitations.

#### Scenario: Missing container configuration
- **WHEN** the Phoenix image reference is missing
- **THEN** Compose fails configuration validation rather than selecting an implicit latest image
