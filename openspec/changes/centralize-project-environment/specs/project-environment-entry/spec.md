## ADDED Requirements

### Requirement: Centralized environment entry

The project registry SHALL expose global environment management using the existing environment implementation and permission.

#### Scenario: Authorized access

- **WHEN** an authorized user opens the registry environment section
- **THEN** existing environment operations are available with an explicit machine-wide scope

#### Scenario: Unauthorized access

- **WHEN** a user without the environment permission opens that section
- **THEN** the environment component is not mounted and a permission explanation is shown

#### Scenario: Legacy URL

- **WHEN** the old Forge environment URL is opened
- **THEN** it redirects to the project registry environment section preserving other query parameters

#### Scenario: Project environment

- **WHEN** a project environment is viewed
- **THEN** project-specific evidence and addresses are distinguished from global tools and a global management link is available
