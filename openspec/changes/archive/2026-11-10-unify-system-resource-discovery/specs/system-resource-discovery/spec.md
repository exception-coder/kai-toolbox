## ADDED Requirements

### Requirement: Reference system resources through providers

The system SHALL bind provider-owned resources to registered project identities without copying credentials or guessing identity by name.

#### Scenario: Discover resources

- **WHEN** a caller discovers a registered system
- **THEN** it receives resource references, environment, account label, credential configuration state and supported capabilities without passwords

#### Scenario: Unbound existing resource

- **WHEN** a resource has no explicit relationship
- **THEN** configuration shows it as available for association and system discovery does not infer a binding

### Requirement: Enforce execution through a shared boundary

Tools and MCP SHALL use the same service to resolve enabled bindings and validate the current provider and environment before execution.

#### Scenario: Production or changed resource

- **WHEN** a bound resource is deleted, disabled, loses its provider or changes to a non-test environment
- **THEN** execution is refused with an actionable error

#### Scenario: SQL writes

- **WHEN** an AI query contains a write operation
- **THEN** the server rejects it through the existing read-only SQL policy

### Requirement: Centralize resource configuration

AI delivery SHALL expose resource relationships and existing source configuration while preserving old resource IDs and history.

#### Scenario: Legacy navigation

- **WHEN** the old ops link is opened
- **THEN** it redirects to the central resource page without dropping query parameters

#### Scenario: Unsupported connector

- **WHEN** a resource type has registration support only
- **THEN** the UI and discovery describe it as registration-only instead of claiming executable capability
