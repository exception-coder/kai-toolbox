## ADDED Requirements

### Requirement: SQL scripts are delivered without automatic registration
Forge SHALL deliver SQL scripts in the response without exposing or requiring register_pending_sql, while preserving evidence and execution authorization boundaries.

#### Scenario: Native tool discovery and legacy call
- **WHEN** a normal development or restricted consultation client lists Forge tools
- **THEN** register_pending_sql is absent and a call to that name is rejected as unknown
- **AND** remaining tools keep their existing policy boundaries

#### Scenario: SQL requested in consultation
- **WHEN** a user requests a database change script
- **THEN** the response may contain SQL without registration, and consultation remains unable to execute database writes

#### Scenario: Existing records
- **WHEN** the updated tool layer is loaded
- **THEN** existing SQL records and historical messages are not deleted or rewritten
