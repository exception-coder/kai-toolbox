## ADDED Requirements

### Requirement: Current Codex session discovers available authorization directories

The system SHALL list direct child directories of the runtime user's home whose names begin with `.codex`, without exposing unrelated home-directory entries.

#### Scenario: Multiple authorization directories exist
- **WHEN** an official Codex session opens its Auth directory configuration
- **THEN** the interface lists the discovered authorization directories in stable order
- **AND** identifies the directory bound to the current session

#### Scenario: Discovery is unavailable
- **WHEN** authorization directories cannot be loaded
- **THEN** the current session remains usable
- **AND** the interface falls back to authorization directories already bound to known sessions

### Requirement: Authorization switching preserves identity boundaries

The system MUST NOT mutate the authorization directory of an existing Codex session in place.

#### Scenario: User selects another authorization directory
- **WHEN** the user selects a directory different from the current session and confirms the action
- **THEN** the system retains the source session
- **AND** creates and opens a new session with the source work directory and runtime configuration
- **AND** binds the new session to the selected authorization directory
- **AND** sends a versioned, explicit handoff package containing the bounded loaded user/assistant conversation
- **AND** records specification references, completeness limits, evidence recovery order and target-side verification requirements
- **AND** does not represent hidden model state, tool state or unverified specifications as transferred facts
- **AND** reloads models, plugins, MCP servers and account permissions from the selected authorization directory

#### Scenario: User cancels confirmation
- **WHEN** the user returns from the confirmation step
- **THEN** no session is created
- **AND** the current session remains selected

#### Scenario: Target authorization already belongs to the session lineage
- **WHEN** the user switches to an authorization directory already associated with the same logical session lineage
- **THEN** the system restores the associated session instead of creating another session
- **AND** does not generate or send another handoff package

#### Scenario: Repeated or concurrent switch request
- **WHEN** the same logical session lineage targets the same authorization directory more than once
- **THEN** at most one persistent session association exists for that pair
- **AND** subsequent requests resolve to that session
