## ADDED Requirements

### Requirement: Observable initialization lifecycle
Forge SHALL persist ordered initialization stages and expose UNINITIALIZED, INITIALIZING, AI_READY, DEGRADED, SYNC_REQUIRED and FAILED states.

#### Scenario: Concurrent initialization
- **WHEN** a run is already active for a project
- **THEN** another initialization request is rejected without creating a second active run

#### Scenario: Failed or interrupted run
- **WHEN** a stage fails or the server restarts during initialization
- **THEN** the run becomes FAILED with a recovery message and the last published profile remains available

### Requirement: Versioned evidence assets
Each completed initialization SHALL publish a versioned profile containing Project Profile, Code Intelligence, Semantic Registry, Execution Profile and Verification Profile with source references and explicit gaps.

#### Scenario: Incomplete evidence
- **WHEN** required evidence is missing, malformed or stale
- **THEN** Forge publishes DEGRADED rather than AI_READY and explains how to recover

#### Scenario: Source drift
- **WHEN** source state differs from the published profile fingerprint
- **THEN** Forge reports SYNC_REQUIRED

#### Scenario: Manual sync
- **WHEN** the user requests Sync
- **THEN** Forge rechecks assets and publishes a new profile version without claiming automatic incremental graph rebuilding
