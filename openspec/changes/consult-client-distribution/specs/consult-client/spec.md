## ADDED Requirements

### Requirement: Business consultation client boundary
The system SHALL provide a business-only client API that creates and continues canonical consultation objects with the authenticated user's identity and existing runtime account/resource policies.

#### Scenario: New external question
- **WHEN** an authenticated client submits a new question with a stable request ID
- **THEN** the system records a consultation and its runtime binding atomically and streams projected answer events
- **AND** retries reuse that request and reject a changed body or another consultation

### Requirement: Restricted connection authentication
The system SHALL require an enabled integration, valid user identity and a short-lived one-time Origin-bound ticket before accepting business WebSocket commands.

#### Scenario: Unauthorized operation
- **WHEN** a client reuses a ticket, changes the Origin, requests another user's consultation or sends a development command
- **THEN** the operation is rejected without exposing protected data or expanding permissions

### Requirement: Recoverable SDK transport
The SDK SHALL provide typed browser and Node.js APIs, attachment upload, history pagination, bounded reconnect and durable non-secret checkpoints without automatically replaying business input.

#### Scenario: Disconnect after send
- **WHEN** the connection closes before an acknowledgement
- **THEN** the SDK reports unknown send status and restores observation using the original consultation and cursor when available
- **AND** it does not create or send a new business request automatically

### Requirement: Editable integration architecture
Delivery SHALL include native editable draw.io views, matching previews, package installation instructions and runnable consumer examples with truthful implementation and runtime status.

#### Scenario: Project team handoff
- **WHEN** a team installs the locally packed SDK
- **THEN** declarations and ESM exports are usable without React or repository-private imports
- **AND** documentation identifies the required server version, feature switch, identity and Origin configuration
