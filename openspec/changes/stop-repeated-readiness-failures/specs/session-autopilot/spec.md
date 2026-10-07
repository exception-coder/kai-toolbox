## ADDED Requirements

### Requirement: Repeated readiness rejection stops automatic continuation
Runtime SHALL independently consume Forge execution and change readiness results. Two consecutive distinct calls with the same failure fingerprint in the same run generation, change revision, phase and task SHALL persist a recoverable waiting state and remove automatic continuation messages. Task progress and user messages MUST be preserved.

#### Scenario: A successful turn contains repeated readiness failures
- **WHEN** two distinct readiness calls fail identically and the enclosing Agent turn later ends successfully
- **THEN** the run remains waiting and no subsequent automatic continuation is dispatched
- **AND** the dashboard shows the blocking tool and instructions to repair and resume

#### Scenario: A result is replayed
- **WHEN** the same turn and tool call result is received again
- **THEN** it does not count as another failure

#### Scenario: The failure has recovered or context changes
- **WHEN** readiness succeeds, its failure changes, the execution context changes, or the user resumes into a new generation
- **THEN** a new consecutive failure streak begins

#### Scenario: A transient or ordinary test failure occurs
- **WHEN** capacity, rate limiting, network timeout or an ordinary verification tool fails
- **THEN** the readiness guard does not classify it as repeated configuration rejection

#### Scenario: An outdated scheduler writes a continuation after blocking
- **WHEN** a continuation was prepared from an older active snapshot but the run is now waiting
- **THEN** the scheduler removes that continuation and does not request its release
