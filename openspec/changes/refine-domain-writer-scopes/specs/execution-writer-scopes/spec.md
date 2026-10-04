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
