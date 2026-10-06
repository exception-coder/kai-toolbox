## ADDED Requirements

### Requirement: Initialize missing team repositories through a separate action
The system SHALL expose a repository initialization and pull action independently of plugin installation and commit/push. Without an explicit workspace override it SHALL prepare repositories under the user's `.kai-toolbox/team-tools` directory.

#### Scenario: Missing local workspace
- **WHEN** the user selects initialize/pull and the workspace or a fixed team repository is absent
- **THEN** the system creates the workspace and clones absent repositories from the selected source, reporting progress without installing plugins or pushing changes

#### Scenario: Existing repository
- **WHEN** the user selects initialize/pull for an existing repository
- **THEN** the system retains its origin and performs a fast-forward-only pull

#### Scenario: Local content must be preserved
- **WHEN** a repository has uncommitted changes or its target exists as a non-Git directory
- **THEN** synchronization reports that repository's failure without deleting or replacing its content, and continues other repositories

#### Scenario: Viewing the panel
- **WHEN** the user opens the dependency panel
- **THEN** the system displays status without automatically starting a clone, installation, commit or push
