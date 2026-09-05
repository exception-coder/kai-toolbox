## ADDED Requirements

### Requirement: Framework-independent typed SDK
The system SHALL publish a framework-independent TypeScript SDK with generated declarations and stable methods for connecting, subscribing, loading history, sending messages and attachments, answering business questions, interrupting the participant's active turn, and destroying the client.

#### Scenario: Host application initializes the SDK
- **WHEN** a host provides a request base URL and access-token callback
- **THEN** the SDK connects to the single session represented by the grant without requiring React or exposing administrator configuration

### Requirement: Durable client recovery semantics
The SDK SHALL preserve non-sensitive connection watermarks and pending command identifiers, retry recoverable failures with bounded exponential backoff, and surface non-recoverable expiry or revocation without retry loops.

#### Scenario: Browser refreshes after an accepted send
- **WHEN** the browser reloads before receiving the send acknowledgement
- **THEN** the SDK reuses the command identifier, resolves the original result, and does not duplicate the message

#### Scenario: Grant is revoked
- **WHEN** the server reports grant revocation
- **THEN** the SDK stops reconnecting, clears grant-scoped persisted state, and exposes a terminal revoked state

### Requirement: Constrained reference Client
The system SHALL provide a responsive reference Client that shows session identity, effective constraints, conversation, attachments, current execution/automatic-supervision progress, connection state, business questions, and completion. It MUST NOT render controls for administrator-only capabilities.

#### Scenario: Participant follows an active task
- **WHEN** the bound session is running under OpenSpec automatic supervision
- **THEN** the Client shows the current public phase and progress without exposing internal tool details

#### Scenario: Recoverable loading failure
- **WHEN** history or the event stream cannot be loaded temporarily
- **THEN** the Client preserves known context and presents retry or reconnection actions instead of a dead end

### Requirement: Owner-visible delegation controls
The Forge session UI SHALL show active delegated participants and SHALL provide create, pause, resume, revoke, copy invitation, and takeover controls according to owner authorization.

#### Scenario: Owner opens a delegated session
- **WHEN** the owner views the Vibe Coding session
- **THEN** the UI shows the participant, profile, expiry, connection state, resource usage, and latest audit activity

### Requirement: Independent release compatibility
The Session Client SDK SHALL be built and versioned independently from the existing Assistant SDK and SHALL declare the public protocol versions it supports.

#### Scenario: Server protocol is incompatible
- **WHEN** the Client connects to a server with no mutually supported public protocol version
- **THEN** the SDK returns an explicit upgrade-required error without attempting to send session commands

