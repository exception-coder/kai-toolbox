## ADDED Requirements

### Requirement: Unified development navigation
The system SHALL expose one project development entry with ERP, ERP mini program, SRM, SCM and Forge tabs while preserving existing configurations and permissions.

#### Scenario: Legacy link
- **WHEN** a user follows an existing development home URL with query parameters and a fragment
- **THEN** the unified page selects the matching system and preserves unrelated parameters and fragment

#### Scenario: Limited permission
- **WHEN** a user has access to only one existing system
- **THEN** the entry opens that system and does not render unauthorized system content

#### Scenario: Draft preservation
- **WHEN** a user edits configuration then switches systems and returns
- **THEN** the unsaved form remains available

### Requirement: In-page extension capability
The system SHALL provide an authorized add-module action within project development and instruct generated workbenches to join this page.

#### Scenario: Add module
- **WHEN** an authorized user opens add module
- **THEN** the existing scaffold workflow is available inside the page and can return to the selected system

#### Scenario: New workbench
- **WHEN** the scaffold generates another system
- **THEN** it registers a tab and its original permission rather than another visible sidebar entry
