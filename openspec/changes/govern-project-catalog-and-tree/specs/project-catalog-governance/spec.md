## ADDED Requirements

### Requirement: Central project catalog and access policy
All project consumers SHALL use one project catalog and obey global exclusions, while administration retains excluded entries for recovery.

#### Scenario: Managed placeholder and real source
- **WHEN** a business template names a missing managed directory and a real workspace exists
- **THEN** runtime discovery uses the real catalog entry and does not let the template shadow it

#### Scenario: Exclusion and recovery
- **WHEN** a project is excluded in the project library
- **THEN** normal lists omit it and new path-based or registered-project loading rejects it, including descendants, until restored
- **AND** source files and historical records remain unchanged

#### Scenario: Conflicting names
- **WHEN** distinct source paths share a directory name
- **THEN** the catalog preserves both paths and name-based resolution rejects ambiguity

#### Scenario: Configuration failure
- **WHEN** saving visibility fails
- **THEN** the management view reports the failure and retains a retry action without claiming success
