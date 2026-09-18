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
