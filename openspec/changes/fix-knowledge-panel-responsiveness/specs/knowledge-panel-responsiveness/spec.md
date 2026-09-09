## ADDED Requirements

### Requirement: Local expansion
Expanding the project knowledge panel SHALL display cached evidence without automatically starting Graphify status detection or repository discovery.

#### Scenario: Open cached panel
- **WHEN** the user expands the panel
- **THEN** the panel displays available cached status with an explicit check action and remains collapsible

### Requirement: Bounded live status
Live status checks SHALL use cancellation and a finite deadline, disable implicit retries and expose a recovery action on failure.

#### Scenario: Close during a check
- **WHEN** the user closes the panel during a live check
- **THEN** the pending client request is cancelled and no graph generation is started

#### Scenario: Failed check
- **WHEN** a live check fails
- **THEN** cached evidence remains visibly distinguished from live results and the user can retry
