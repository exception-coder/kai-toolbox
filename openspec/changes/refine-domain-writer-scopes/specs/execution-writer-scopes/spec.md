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
