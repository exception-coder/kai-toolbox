## ADDED Requirements

### Requirement: Multiple resources per system
The system SHALL allow an administrator to configure multiple database and application resources and explicitly bind any number of them to a registered project system.

#### Scenario: Configure two application environments
- **WHEN** an administrator creates TEST and UAT application resources and binds both to one system
- **THEN** resource discovery returns both bindings with distinct identifiers, environments, accounts, and capabilities

### Requirement: Server-owned credentials
The system MUST keep database and application passwords on the server and SHALL expose only whether credentials are configured.

#### Scenario: Read the resource catalog
- **WHEN** the UI or Agent discovers configured resources
- **THEN** responses contain no password, token, cookie, or credential-bearing URL

#### Scenario: Preserve an existing password
- **WHEN** an administrator edits a resource and leaves the password field empty
- **THEN** the existing stored password remains unchanged

### Requirement: Stable Forge resource tools
Forge SHALL expose configured resources through `discover_resources` and `execute_resource` without creating a separate MCP server or tool name for each business system.

#### Scenario: Add a resource without changing tools
- **WHEN** an administrator adds and binds a resource after a session has been created
- **THEN** the next discovery returns the resource while the Forge tool names remain unchanged

### Requirement: Runtime resource enforcement
The server MUST revalidate the binding, enabled state, environment, operation capability, and target boundary on every execution.

#### Scenario: Reject a production resource
- **WHEN** an Agent attempts to execute a resource marked PROD
- **THEN** the server rejects the operation without opening the database or application connection

#### Scenario: Restrict application calls to the configured origin
- **WHEN** an application call targets a different host or port from its configured base URL
- **THEN** the server rejects the call without sending credentials

### Requirement: Legacy compatibility without default injection
The system SHALL retain existing fixed ERP/SRM/SCM resource endpoints during migration but MUST NOT inject their fixed MCP servers into new ordinary development sessions by default.

#### Scenario: Start an ordinary development session
- **WHEN** Forge prepares the session MCP configuration
- **THEN** the session receives the Forge resource tools and does not receive fixed `erp_db`, `erp_app`, `srm_db`, `srm_app`, or `scm_db` servers

### Requirement: Connection test feedback stays with its datasource

The UI SHALL show progress and the final connection test result beside the relevant datasource row or editor action, rather than only below the full datasource list.

#### Scenario: Test from the editor

- **WHEN** an administrator tests an existing connection in its editor
- **THEN** progress and success with elapsed time or failure with a reason appear beside the action, and another test cannot be started while one is pending
- **AND** the request uses the saved datasource ID without saving form changes, as stated in the editor

#### Scenario: Retry or switch datasource

- **WHEN** the administrator retries a failed test or switches editors before a result arrives
- **THEN** retry clears the previous feedback, and results remain associated with their original datasource ID
- **AND** testing from a list row shows the result on that row without requiring scrolling to the list end

### Requirement: Fixed environment choices use the shared control

The datasource editor SHALL use the shared Combobox in selection-only mode for environment and middleware type, with theme-consistent option rendering and keyboard navigation.

#### Scenario: Select an environment with an existing value

- **WHEN** the administrator opens the environment selector while UAT or another standard value is selected
- **THEN** the full LOCAL, DEV, TEST, UAT and PROD list is shown with Chinese labels and a selected marker, rather than filtered by the current value
- **AND** selecting an option updates only the draft until the administrator saves through the existing datasource API

#### Scenario: Preserve a historical environment

- **WHEN** an existing datasource contains a custom environment outside the standard choices
- **THEN** its exact value remains visible as a historical value and is preserved on save unless the administrator explicitly selects a standard option
- **AND** the UI change does not alter connection addresses, resource authorization or server environment enforcement

#### Scenario: Existing editable consumers

- **WHEN** a caller uses Combobox without selection-only mode
- **THEN** existing free-text input behavior is preserved
