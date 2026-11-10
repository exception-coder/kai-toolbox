## ADDED Requirements

### Requirement: Compact supervision reading order
The session supervision panel SHALL present health, quantitative progress, actionable issues, batch progress and collapsed execution context in a single-column reading order.

#### Scenario: Active supervision
- **WHEN** supervision is active
- **THEN** Runtime and Skill status SHALL be inline and the primary lifecycle action SHALL be stop
- **AND** secondary paths, timestamps and continuation explanations SHALL be collapsed by default

#### Scenario: Paused supervision
- **WHEN** supervision is paused or requires recovery
- **THEN** the panel SHALL show the existing resume or budget recovery action without a competing stop action

### Requirement: Honest quantitative indicators
The panel SHALL distinguish completion from consumption risk and display unknown metrics explicitly.

#### Scenario: High completion and high budget use
- **WHEN** completion and consumed turns both reach 98 percent
- **THEN** completion SHALL keep the normal accent while consumed budget SHALL show a warning

#### Scenario: Context usage is unavailable
- **WHEN** the supervision response does not include context usage
- **THEN** the panel SHALL display unavailable and SHALL NOT substitute cache-hit percentage or cumulative tokens

### Requirement: Visible recoverable issues
The panel SHALL promote actual deferred issues and unfinished manual tasks, preserve confirmed data after failed reads, and expose retry actions.

#### Scenario: Tasks include completed manual work
- **WHEN** a marked manual task is complete
- **THEN** it SHALL NOT be included in pending manual counts

#### Scenario: Narrow screen and read failure
- **WHEN** the panel is displayed on a narrow screen and a control read fails
- **THEN** content SHALL wrap without horizontal overflow and the developer SHALL be able to retry without losing the project or last known state
