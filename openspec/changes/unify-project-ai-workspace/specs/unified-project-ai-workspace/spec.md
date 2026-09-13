## ADDED Requirements

### Requirement: One directory configuration

Forge SHALL use one project directory list and scan policy for project discovery, AI workspaces and local project operations.

#### Scenario: Import legacy configuration

- **WHEN** directory settings are opened before the first unified save
- **THEN** legacy default root and workspace roots are merged without duplicates
- **AND** a single successful save makes the edited list authoritative

#### Scenario: Explicitly remove a legacy root

- **WHEN** a unified directory list omits the former default root or is empty
- **THEN** the old default root is not reintroduced
- **AND** paths outside the configured roots remain rejected

#### Scenario: Multiple roots

- **WHEN** two project roots are configured
- **THEN** project discovery and local Git operations support both roots with the same scan policy

#### Scenario: Save fails

- **WHEN** the unified configuration update fails
- **THEN** the original configuration and editable draft remain available

### Requirement: Single project entry

Forge SHALL present one registered project list and offer local discovery within adding a project, without a parallel module workspace project list.

#### Scenario: Open a project

- **WHEN** a user opens a registered project
- **THEN** its AI workspace is displayed under the same project identity
- **AND** profile, tasks and settings remain accessible

#### Scenario: Add a discovered project

- **WHEN** a user chooses Add Project
- **THEN** local discovery and manual registration are available
- **AND** an already registered directory opens its existing project

### Requirement: Project scope is authoritative

The workspace SHALL use the current registered project path and SHALL preserve existing session IDs.

#### Scenario: Previously selected another directory

- **WHEN** local storage remembers project B and project A is opened
- **THEN** module requests and root conversation use project A
- **AND** project B is not selected as a fallback

#### Scenario: Show project sessions

- **WHEN** sessions include the project root, descendants and a similarly prefixed sibling
- **THEN** only root and descendant sessions are displayed
- **AND** opening history resumes the selected session ID

#### Scenario: Uninitialized or undiscovered project

- **WHEN** a registered project has no profile or is absent from local discovery
- **THEN** its workspace remains available without automatic initialization
- **AND** module access failures provide a recovery action

### Requirement: Legacy links remain recoverable

Forge SHALL accept legacy module workspace links without creating or deleting project records.

#### Scenario: Known previous project

- **WHEN** a legacy module link is opened and the remembered path matches a registered project
- **THEN** the user reaches that project's AI workspace

#### Scenario: No previous match

- **WHEN** a legacy module link has no registered match
- **THEN** the unified project list is shown with an Add Project entry
