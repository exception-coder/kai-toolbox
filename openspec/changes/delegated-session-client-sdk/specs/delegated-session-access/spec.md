## ADDED Requirements

### Requirement: Owner-controlled session delegation
The system SHALL allow an administrator or session owner to delegate exactly one Forge session to an identified participant with an expiry, supported capability profile, and resource limits. The participant MUST NOT create a delegation or change its profile.

#### Scenario: Owner creates a delegation
- **WHEN** an authorized owner selects a session, participant, expiry, and supported profile
- **THEN** the system creates an active grant bound to that session and participant and displays its effective constraints

#### Scenario: Participant attempts to widen access
- **WHEN** a participant submits a different session, workspace, capability, engine, model, provider, permission mode, or limit
- **THEN** the system rejects the request without changing the stored grant or bound session

### Requirement: Single-use participant pairing
The system SHALL require an authenticated participant to exchange a short-lived, single-use invitation before accessing the delegated session. Invitation material and session access tokens MUST NOT grant Forge administration privileges.

#### Scenario: Valid invitation exchange
- **WHEN** the intended authenticated participant exchanges an unexpired unused invitation
- **THEN** the system consumes the invitation and returns access scoped to the bound grant and session

#### Scenario: Replayed or mismatched invitation
- **WHEN** an invitation is expired, already consumed, revoked, or used by a different participant
- **THEN** the system denies the exchange and records the denied attempt without revealing session details

### Requirement: Immediate pause and revocation
The system SHALL let the owner pause or revoke a grant and SHALL prevent all subsequent participant commands. Revocation MUST terminate active public connections for that grant.

#### Scenario: Owner revokes an active delegation
- **WHEN** the owner revokes a grant while its Client is connected
- **THEN** the system closes the public connection, rejects later commands, and preserves the canonical Forge session for owner access

### Requirement: Server-enforced execution boundary
The system SHALL enforce delegated execution in both the public gateway and the Agent Sidecar. Client content and configuration MUST NOT weaken either enforcement layer.

#### Scenario: Prompt asks to bypass constraints
- **WHEN** a participant asks the Agent to change workspace, reveal secrets, switch provider, enable bypass permissions, or call a disallowed tool
- **THEN** the gateway or Sidecar denies the operation and emits only a safe participant-facing explanation

### Requirement: Separated approval authority
The system SHALL allow participants to answer business clarification questions but MUST route risky tool approvals only to the Forge owner interface according to the stored profile.

#### Scenario: Agent needs business clarification
- **WHEN** the Agent raises a participant-visible business question
- **THEN** the intended participant can answer it and the answer resumes the same canonical session

#### Scenario: Agent requests risky tool approval
- **WHEN** the Agent requests approval for a tool outside automatic policy
- **THEN** the participant Client cannot approve it and the Forge owner receives or retains the approval request

### Requirement: Delegation audit trail
The system SHALL audit grant creation, invitation exchange, connection, participant commands, constraint denials, pause, revocation, expiry, and owner takeover without storing credentials or full sensitive message bodies.

#### Scenario: Owner reviews a delegation
- **WHEN** the owner opens delegation details
- **THEN** the system shows ordered audit metadata with actor, action, result, timestamp, and correlation identifier

