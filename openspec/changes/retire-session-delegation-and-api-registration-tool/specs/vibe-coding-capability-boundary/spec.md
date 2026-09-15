## ADDED Requirements

### Requirement: Vibe Coding excludes delegated session access
The system SHALL expose Vibe Coding sessions only through the owner-operated Forge workspace and SHALL NOT expose delegation grants, invitation exchange, public Session Client WebSocket access, relay endpoints, or delegation SDK packages.

#### Scenario: Owner opens a Vibe Coding session
- **WHEN** the owner opens an existing Vibe Coding session
- **THEN** conversation, OpenSpec supervision and normal owner controls remain available
- **AND** no delegation navigation or action is shown

#### Scenario: Legacy client calls a retired endpoint
- **WHEN** a legacy client calls a delegation, invitation, public session client or relay route
- **THEN** Forge does not expose a matching application handler

### Requirement: Retired delegation data is not destructively migrated
The system MUST NOT automatically drop historical delegation tables or records as part of this retirement.

#### Scenario: Existing installation starts after upgrade
- **WHEN** an installation contains historical delegation data
- **THEN** startup does not read, mutate or delete that data
- **AND** the retired capability remains unavailable
