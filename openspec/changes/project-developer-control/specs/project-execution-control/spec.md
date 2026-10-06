## ADDED Requirements

### Requirement: Developer-controlled project coding gates
Forge SHALL expose a project-wide coding-gate switch in automatic supervision, enabled by default and shared by sessions using the same canonical project directory.

#### Scenario: Developer disables gates despite a stale writer
- **WHEN** an authorized developer disables the project gates while an execution writer or its storage lock is damaged
- **THEN** subsequent coding admission and execution-governance requests SHALL return an explicit skipped result without reading that writer
- **AND** existing records, files and validation evidence SHALL remain unchanged

#### Scenario: Gates are enabled again
- **WHEN** the developer enables the project gates
- **THEN** subsequent requests SHALL use the existing identity, scope and evidence checks
- **AND** changes made while disabled SHALL NOT acquire automatic validation or scope approval

### Requirement: Audited independent project control
The developer API SHALL resolve the session's canonical project, enforce session and project access, atomically persist revisioned changes and retain actor, reason and history independently of execution locks.

#### Scenario: Concurrent sessions change the same project
- **WHEN** a session submits an outdated revision or mismatched project identity
- **THEN** the API SHALL reject the change and allow the developer to refresh the actual state

#### Scenario: Separate project or invalid configuration
- **WHEN** another project has no control record
- **THEN** its gates SHALL remain enabled
- **AND** malformed existing configuration SHALL NOT silently disable checks

### Requirement: Honest supervision under developer control
Disabled governance SHALL allow actual pending development tasks to continue without mandatory governance validation, while retaining task facts, budgets, pause controls and resource or restart authorization.

#### Scenario: Development ends with governance disabled
- **WHEN** no executable development tasks remain
- **THEN** supervision SHALL record an unverified developer handoff and may continue the next selected change
- **AND** it SHALL NOT mark skipped checks passed, complete old writer executions, check off manual tasks or automatically archive

#### Scenario: Developer switches during verification
- **WHEN** a running verification attempts to save after gates are disabled
- **THEN** its output SHALL NOT overwrite the existing execution validation record

### Requirement: Recoverable mobile and keyboard controls
The supervision panel SHALL show the affected project and confirmed state with keyboard access, a minimum 44px touch target and a refresh action for failed requests.

#### Scenario: Saving fails or the result is unknown
- **WHEN** a switch request fails
- **THEN** the panel SHALL retain the last known state, refresh the server state and expose recovery without claiming success
