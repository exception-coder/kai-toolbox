## ADDED Requirements

### Requirement: Single directory management entry

The system SHALL expose workspace roots, default project root, managed source root, scan hidden prefixes and cache durations, and managed Git timeout in Project Registry directory settings, preserving their distinct scopes and existing effective values.

#### Scenario: Existing configuration
- **WHEN** the directory settings page opens
- **THEN** it displays the existing configuration without copying or resetting paths and explains each directory's purpose

#### Scenario: Legacy configuration entry
- **WHEN** a user opens a directory block deep link in configuration center
- **THEN** the application replaces that location with Project Registry directory settings and no longer offers duplicate directory editing in configuration center

### Requirement: Safe partial configuration updates

The system SHALL validate absolute paths and positive integer durations, save only edited fields through existing configuration APIs, preserve drafts on failure, and provide retryable loading errors.

#### Scenario: List replacement
- **WHEN** the user clears hidden prefixes or replaces workspace roots
- **THEN** the saved list replaces the previous list without retaining trailing items, while unedited fields remain unchanged

#### Scenario: Invalid duration
- **WHEN** a non-positive or non-integer cache duration is entered
- **THEN** saving is rejected with an actionable error and no configuration is written

#### Scenario: Failed save
- **WHEN** saving fails
- **THEN** the draft remains editable and the error is visible for retry

### Requirement: Shared project resolution for context queries

Graphify name lookup and cross-project topology lookup SHALL use the existing local project resolver, including managed source projects and the configured discovery rules, without directly reading Claude workspace root keys.

#### Scenario: Managed project
- **WHEN** the resolver returns a project in managed sources
- **THEN** context lookup uses that project directory

#### Scenario: Missing project resolver
- **WHEN** no resolver or project is available
- **THEN** optional context lookup returns its existing unavailable result without failing the primary workflow

#### Scenario: Explicit graph path
- **WHEN** Graphify receives an existing absolute project path
- **THEN** the existing explicit-path behavior remains supported
