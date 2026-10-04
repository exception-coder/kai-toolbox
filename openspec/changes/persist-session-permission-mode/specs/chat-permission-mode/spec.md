# Chat permission mode

## ADDED Requirements

### Requirement: Session permission mode persists across devices

The application SHALL store a valid selected permission mode with the session metadata and SHALL restore it when the session is opened on another device or rebuilt after a backend restart.

#### Scenario: Reopen session on another device

- **WHEN** a user selects a permission mode and opens the same session on another device
- **THEN** the second device displays the saved mode and the next turn uses it

### Requirement: Online viewers receive mode changes

The application SHALL notify online viewers of a session when its permission mode changes, while preserving server enforced read only policies.

#### Scenario: Two devices view one session

- **WHEN** one device changes the mode
- **THEN** the other device displays the new mode without refreshing
