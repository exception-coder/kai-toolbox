## ADDED Requirements

### Requirement: Vibe Coding excludes delegated session access
The system SHALL expose Vibe Coding development sessions only through the owner-operated Forge workspace and SHALL NOT expose delegation grants, invitation exchange, public Session Client WebSocket access, delegation relay endpoints, or delegation SDK packages. The independent readonly capsule consultation channel SHALL remain available under its host authentication and ownership boundary.

#### Scenario: Owner opens a Vibe Coding session
- **WHEN** the owner opens an existing Vibe Coding session
- **THEN** conversation, OpenSpec supervision and normal owner controls remain available
- **AND** no delegation navigation or action is shown

#### Scenario: Legacy client calls a retired endpoint
- **WHEN** a legacy client calls a delegation, invitation, public session client or delegation relay route
- **THEN** Forge does not expose a matching application handler

#### Scenario: Host opens a capsule consultation
- **WHEN** an authenticated business host connects to the capsule consultation route
- **THEN** Forge permits only the host participant's readonly consultation sessions
- **AND** this does not enable delegation grants, invitations or development access

### Requirement: Retired delegation data is not destructively migrated
The system MUST NOT automatically drop historical delegation tables or records as part of this retirement.

#### Scenario: Existing installation starts after upgrade
- **WHEN** an installation contains historical delegation data
- **THEN** startup does not read, mutate or delete that data
- **AND** the retired capability remains unavailable
