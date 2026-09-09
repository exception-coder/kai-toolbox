## ADDED Requirements

### Requirement: Roles are presented as a scannable management workspace
The system SHALL present role identity, code, data scope, status, built-in protection, and available actions with a clear reading order on desktop and narrow screens.

#### Scenario: Administrator reviews roles on desktop
- **WHEN** the role list loads successfully at a desktop viewport
- **THEN** the system shows aligned role information and keeps the primary actions easy to scan without decorative card nesting

#### Scenario: Administrator reviews roles on a narrow screen
- **WHEN** the role list is viewed at a narrow viewport
- **THEN** each role's information and actions reflow into a readable vertical order without requiring page-level horizontal scrolling

### Requirement: Role editing has explicit context and validation
The system SHALL provide labeled fields, explanatory context, valid disabled states, and clear save/cancel actions when creating or editing a role.

#### Scenario: Required role fields are incomplete
- **WHEN** the role name or code is blank
- **THEN** the save action remains unavailable and the required fields remain identifiable

#### Scenario: Built-in role is edited
- **WHEN** an administrator edits a built-in role
- **THEN** protected fields remain disabled and the interface explains that the built-in definition is protected

#### Scenario: Role save fails
- **WHEN** the role save request fails
- **THEN** the system retains the edit context and shows an actionable error message

### Requirement: Operational states preserve recovery paths
The system SHALL communicate loading, empty, and failed role-list states within the role-management context and SHALL provide a useful next action where one exists.

#### Scenario: Role list is empty
- **WHEN** the role query succeeds with no roles
- **THEN** the system explains the empty state and offers role creation to authorized users

#### Scenario: Role list request fails
- **WHEN** the role query fails
- **THEN** the system explains that roles could not be loaded and provides a retry action

### Requirement: Existing role contracts remain unchanged
The system MUST preserve existing role CRUD requests, permission checks, built-in-role protection, and the transition into permission assignment.

#### Scenario: Administrator opens permission assignment
- **WHEN** an authorized administrator selects permission assignment for a mutable role
- **THEN** the existing permission explorer opens for that role without changing the server contract
