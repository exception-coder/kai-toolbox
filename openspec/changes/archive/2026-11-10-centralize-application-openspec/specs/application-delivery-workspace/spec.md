## ADDED Requirements

### Requirement: Organize delivery by registered application

The delivery center SHALL list registered project identities and expose OpenSpec work inside each application using an unambiguous source-directory match.

#### Scenario: Matched application

- **WHEN** exactly one registered system and one OpenSpec workspace share the same normalized source directory
- **THEN** the application displays that workspace's changes, completed tasks and remaining tasks through existing official queries

#### Scenario: Missing or ambiguous match

- **WHEN** a directory is missing or multiple identities match
- **THEN** the application shows the missing association and recovery links without using another workspace's tasks

### Requirement: Preserve scoped navigation and compatibility

The system SHALL preserve previous board links and existing requirement operations while presenting application-scoped work within the delivery center.

#### Scenario: Legacy board link

- **WHEN** the old board URL is opened
- **THEN** it redirects into the delivery center and preserves query and fragment context

#### Scenario: Switching applications

- **WHEN** the user changes the selected application
- **THEN** task selection resets and no task detail from the previous application's workspace is presented as current

#### Scenario: Existing requirement management

- **WHEN** the user opens the requirements entry
- **THEN** the existing registration, execution and verification workflow remains available
