# Execution writer scopes

## ADDED Requirements

### Requirement: Disjoint domain implementations can run concurrently

Forge SHALL allow two sessions to hold write executions in different named frontend features or different build modules when their declared files and shared design targets do not overlap.

#### Scenario: Separate frontend features

- **WHEN** two sessions declare files under different `frontend/src/features/{feature}` directories
- **THEN** neither feature's write ownership blocks the other

### Requirement: Shared targets remain exclusive

Forge SHALL reject a second execution that claims the same feature, exact shared file, parent module build configuration, or repository-wide file already covered by an active writer.

#### Scenario: Parent module configuration

- **WHEN** one session owns a frontend feature and another declares `frontend/package.json`
- **THEN** Forge reports a write conflict

### Requirement: Module-local database changes use module ownership

Forge SHALL scope a database file inside an identified build module to that module or its explicit domain directory. A repository-root migration with no module owner SHALL remain global.

#### Scenario: Separate module schemas

- **WHEN** two sessions declare local schema files in separate build modules
- **THEN** their write ownership does not conflict solely because both paths contain `db`

### Requirement: Ordinary paths do not imply global ownership

Forge SHALL claim unowned ordinary files, governance files and ordinary Sidecar source files by exact path. Root build configuration and root database directories SHALL retain global coordination. Sidecar module build configuration SHALL conflict with its child paths.

#### Scenario: IAM governance file alongside SRM

- **WHEN** IAM declares its module files and `.team-standards/design-baselines.json` while SRM declares a separate module
- **THEN** both executions can coexist; another writer of that governance file is rejected

#### Scenario: Separate Sidecar implementations

- **WHEN** one writer declares `src/execution/service.ts` and another declares `src/execution/writers.ts` within Sidecar
- **THEN** their exact file claims do not conflict, while a Sidecar package configuration claim conflicts with both

### Requirement: An owner can explicitly extend the same execution

Forge SHALL accept an explicit update of the owner's active execution using the inspected execution ID and scope revision. The update SHALL preserve project, session, branch, change, task, original files, design targets and required verification categories. It SHALL reject conflicts with other writers, stale revisions and policy downgrades. The original execution identity and baselines SHALL remain, with previous discovery, assessment and verification retained as audit history.

#### Scenario: Add V096 to the same task

- **WHEN** the owner discovers the complete original file list plus V096 and assesses it with the current update identity and revision
- **THEN** Forge keeps the execution ID, grants the added exact file, records the old context and invalidates active verification

#### Scenario: Retry or stale concurrent update

- **WHEN** an identical accepted update is retried
- **THEN** Forge returns the same execution without adding another history entry
- **AND** a different update with the old revision is rejected without changing the record

#### Scenario: Old verification finishes after an update

- **WHEN** verification started before the scope update finishes afterward
- **THEN** its result cannot be stored as evidence for the updated execution

#### Scenario: Unrelated writer or reduced scope

- **WHEN** an update overlaps another active writer, removes original files or lowers required checks
- **THEN** the update is rejected and existing permissions and history remain unchanged
