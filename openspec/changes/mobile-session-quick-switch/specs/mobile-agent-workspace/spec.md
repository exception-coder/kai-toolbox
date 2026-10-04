## ADDED Requirements

### Requirement: Mobile runtime sheet supports session switching
The mobile Agent runtime sheet SHALL show active sessions and up to eight other recent sessions, and SHALL switch through the existing session identity.

#### Scenario: Active and recent sessions exist
- **WHEN** a user opens the runtime sheet while another live running session exists
- **THEN** the live running session appears in the active group and up to eight other sessions appear in recent activity order
- **AND** the current session is identified without creating a duplicate session

#### Scenario: Select an active session
- **WHEN** a user chooses a live running session
- **THEN** the sheet closes and the existing switch operation receives its session ID and running hint

#### Scenario: Session list is unavailable
- **WHEN** the session list request fails
- **THEN** the sheet shows an error and offers a retry while remaining closable
