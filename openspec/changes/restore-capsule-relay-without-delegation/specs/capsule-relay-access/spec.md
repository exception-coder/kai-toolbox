## ADDED Requirements

### Requirement: Capsule access remains independent of delegation
Forge SHALL support the existing host capsule WebSocket using configured host credentials without restoring session delegation or its SDKs.

#### Scenario: Existing host reconnects
- **WHEN** an enabled host connects to `/api/session-client/v1/relay/capsule/ws` with valid configured credentials and participant identity
- **THEN** Forge establishes the capsule channel and resolves the same internal user and bound project

#### Scenario: Delegation stays retired
- **WHEN** a consumer requests invitation, delegation or public Session Client WebSocket endpoints
- **THEN** those endpoints remain unregistered

### Requirement: Capsule authentication fails closed
Forge SHALL reject invalid or disabled hosts and invalid participants, and SHALL apply refreshed client configuration to subsequent commands.

#### Scenario: Managed clients are removed
- **WHEN** managed mode is enabled and its client list is empty
- **THEN** authentication fails even if legacy single-client credentials are present

#### Scenario: Host access is revoked
- **WHEN** an authenticated host is disabled or its credentials change before its next command
- **THEN** Forge closes the channel without forwarding that command

### Requirement: Capsule sessions stay within readonly ownership boundaries
Forge SHALL pin capsule sessions to readonly consultation, the host project and the stable participant user, and SHALL reject development commands.

#### Scenario: Client supplies development options
- **WHEN** an open command includes a different project, working directory, credentials or agent mode
- **THEN** Forge removes the development options and uses the authenticated host project and readonly plan policy

#### Scenario: Client attaches an unrelated session
- **WHEN** a capsule participant attaches a development session or another participant's session
- **THEN** existing execution-domain and ownership checks deny access

#### Scenario: Voice connection stays alive
- **WHEN** a valid capsule sends supported voice heartbeat or stop controls
- **THEN** Forge forwards them to the existing consultation session handler

#### Scenario: Capsule loads history and uploads attachments
- **WHEN** an authenticated host uses the capsule REST prefix for supported history or attachment operations
- **THEN** Forge forwards only allowed paths under the participant identity and enforces attachment ownership
- **AND** arbitrary API and delegation targets are rejected and the previous request identity is restored
