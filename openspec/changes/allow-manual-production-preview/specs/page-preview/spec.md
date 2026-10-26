## ADDED Requirements

### Requirement: Manually preview a registered production application
An authenticated administrator SHALL be able to select a configured PROD application in the existing preview workspace. The service SHALL require explicit production confirmation before starting its browser and SHALL NOT expose its credentials.

#### Scenario: Production resource was registered but excluded from the selector
- **WHEN** an administrator loads preview resources
- **THEN** the selector SHALL include configured PROD applications with their environment and account identity
- **AND** the service SHALL reject production creation without productionConfirmed=true
- **AND** a non-administrator SHALL NOT gain access by supplying that flag

#### Scenario: Production handoff or account change
- **WHEN** a production auto link is opened, including a confirmation query parameter
- **THEN** the workspace SHALL remain in setup until the user confirms and submits
- **AND** switching applications or adjusting configuration SHALL reset confirmation

### Requirement: Preserve non-production Agent resource access
Agent and business-consultation resource discovery and credential loading SHALL continue to exclude production accounts. The manual preview extension SHALL NOT replace these existing ports or environment policies.

#### Scenario: Agent requests production credentials
- **WHEN** the original resource port lists or requires an application
- **THEN** PROD SHALL remain excluded or rejected despite being available to the manual preview port
