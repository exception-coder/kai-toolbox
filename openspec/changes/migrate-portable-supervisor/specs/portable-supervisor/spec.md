## ADDED Requirements

### Requirement: Unified source lifecycle
Forge SHALL expose start, stop, status, restart and prepare through one Node entry without requiring PowerShell or Bash for managed execution.

#### Scenario: Source startup
- **WHEN** a developer starts the workspace with supported Node, Java and Maven installed
- **THEN** the private process manager starts source backend and frontend, reports their state, and survives CLI exit

#### Scenario: Observable startup result
- **WHEN** start creates or finds an existing supervisor
- **THEN** it SHALL show preparation progress and wait for enabled frontend/backend HTTP readiness before reporting success, print access URLs, and distinguish optional service failures
- **AND** a bounded timeout or core failure SHALL return nonzero with diagnostic commands while preserving background services

#### Scenario: Port conflict
- **WHEN** an unmanaged process owns a required port
- **THEN** startup fails visibly without terminating that process

### Requirement: Authenticated reload handoff
The controller SHALL preserve protocol v1 and SHALL serialize mutations and truthfully report an independent restart owner.

#### Scenario: Java source update
- **WHEN** Java posts full-reload with its inherited internal token
- **THEN** the controller acknowledges and the independent manager reloads controller code and all enabled services

#### Scenario: Unauthorized restart
- **WHEN** a caller supplies an absent or wrong token
- **THEN** no process is restarted and no token is returned in status

### Requirement: Auxiliary lifecycle
Enabled auxiliary services SHALL have isolated logs and bounded failure retries. Java SHALL remain the Agent Sidecar owner.

#### Scenario: Service failure
- **WHEN** an enabled Python service crashes
- **THEN** the manager restarts it independently with bounded rapid retries and reports failed state when exhausted

#### Scenario: Unsupported desktop integration
- **WHEN** WeChat automation is enabled outside Windows
- **THEN** configuration validation explains the platform limitation

### Requirement: Migration compatibility
Forge SHALL read existing local configuration and preserve startup performance metadata without invoking legacy runtime scripts.

#### Scenario: Retired shortcuts
- **WHEN** a developer follows current startup instructions
- **THEN** the instructions SHALL use node forge.mjs or equivalent Task commands, and obsolete platform launchers and configuration migration scripts SHALL be removed while existing local configuration remains readable

#### Scenario: Stop with no managed services
- **WHEN** no service belongs to the new supervisor but a relevant port remains occupied
- **THEN** stop SHALL report the unmanaged service, return a nonzero exit code, and SHALL NOT claim Forge stopped or kill the port owner
