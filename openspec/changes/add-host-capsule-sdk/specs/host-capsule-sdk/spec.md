## ADDED Requirements

### Requirement: Recoverable connection failures

The SDK SHALL back off and stop after five unsuccessful reconnects before protocol readiness, retain pending input, and expose manual reconnection. Host configuration SHALL be opened through an optional callback without modifying browser endpoints.

#### Scenario: Handshake without ready

- **WHEN** each socket opens and then closes without a ready message
- **THEN** the retry count is retained until exhaustion and a manual retry starts a fresh connection budget

### Requirement: Host capsule authentication

The server SHALL authenticate the registered client and host participant without a business-user Forge login or invitation.

#### Scenario: Unauthenticated caller

- **WHEN** client credentials or participant identity are invalid
- **THEN** the capsule connection is rejected before session access

### Requirement: Readonly project ownership

Capsule sessions SHALL belong to the authenticated client participant and SHALL use the client's project with readonly consultation policy.

#### Scenario: Developer controls

- **WHEN** a capsule sends a development command or another project in its open request
- **THEN** the command is rejected or the project is replaced with the server-resolved client project

#### Scenario: Cross-user history

- **WHEN** a capsule requests another participant's history or attachment
- **THEN** existing ownership checks deny access

### Requirement: Host SDK transport

The JS SDK SHALL use host-issued connection URLs and an authenticated host fetch adapter when configured in host mode.

#### Scenario: Prior direct connection preference

- **WHEN** a stored direct Forge address exists
- **THEN** host mode ignores it and does not offer Forge login or address controls
