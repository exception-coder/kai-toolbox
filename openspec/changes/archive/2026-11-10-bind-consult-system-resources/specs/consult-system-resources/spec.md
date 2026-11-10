## ADDED Requirements
### Requirement: Configure consultation resources
The system SHALL persist selected resource binding IDs in workflow nodes and provide an entry to the existing resource center without copying credentials.
#### Scenario: Save selection
- **WHEN** an administrator selects database resources and saves a candidate
- **THEN** the node preserves those binding IDs and displays their system, environment and current state
### Requirement: Scoped read-only execution
The system SHALL expose dedicated consultation discovery and query tools using the frozen session workflow and exact registered system path.
#### Scenario: Disallowed target
- **WHEN** a query references an unselected, disabled, deleted, non-query or different-system resource
- **THEN** execution is rejected without fallback to another connection
#### Scenario: Read-only capability
- **WHEN** a consultation calls its resource query tool
- **THEN** only a read-only database QUERY is dispatched and no application CALL is available
