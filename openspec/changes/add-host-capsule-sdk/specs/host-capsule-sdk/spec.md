## ADDED Requirements

### Requirement: Remember capsule visibility and recover without a keyboard
The SDK SHALL support opt-in browser-local hidden preferences scoped to its host. Forge SHALL enable this preference and provide a labeled restore action in the session tools menu. Closing only the panel MUST NOT hide the launcher. Unconfigured hosts SHALL retain existing initialization behavior.

#### Scenario: Hide and reload
- **WHEN** a Forge user hides the capsule and reloads the page
- **THEN** the launcher remains hidden

#### Scenario: Restore on a phone
- **WHEN** the user chooses 显示彩虹胶囊 from session tools
- **THEN** the existing assistant opens without a keyboard and the visible preference is saved
- **AND** loading or failure is visible with a retry path

#### Scenario: Storage unavailable
- **WHEN** browser storage rejects access
- **THEN** the current page still permits hiding and restoring without throwing

#### Scenario: Close the panel
- **WHEN** the user closes only the assistant panel
- **THEN** the launcher remains visible and the hidden preference is unchanged

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
