## ADDED Requirements

### Requirement: Versioned public protocol
The system SHALL expose a versioned Session Client protocol independent from the Forge administrator WebSocket protocol. Unknown public commands MUST be rejected and unknown internal events MUST NOT be forwarded.

#### Scenario: Client sends an administrator command
- **WHEN** a Client sends a model, engine, provider, permission, auto-approval, fork, workspace, or session-switch command
- **THEN** the public protocol rejects it as unsupported without invoking the internal command handler

### Requirement: Grant-scoped transport authentication
The system SHALL authenticate REST calls with grant-scoped access and SHALL use a short-lived, single-use connection ticket for WebSocket establishment. Remote transport MUST use HTTPS/WSS and validate an explicitly allowed Origin.

#### Scenario: SDK opens a WebSocket
- **WHEN** an authorized SDK requests a connection ticket and uses it once before expiry from an allowed Origin
- **THEN** the system opens a connection bound to the ticket's grant, participant, and session

#### Scenario: Ticket is replayed
- **WHEN** any Client reuses a consumed or expired ticket
- **THEN** the handshake is rejected without disclosing whether the bound session exists

### Requirement: Idempotent ordered commands
The system SHALL require each mutating command to carry a unique command identifier and expected session version. It MUST return the prior result for a duplicate command and MUST report a version conflict without performing a conflicting mutation.

#### Scenario: Send acknowledgement is lost
- **WHEN** the SDK retries a previously accepted send with the same command identifier
- **THEN** the system returns the original acceptance and creates no duplicate user message

#### Scenario: Stale session version
- **WHEN** a Client submits a command against an obsolete session version
- **THEN** the system rejects it with a recoverable conflict that includes the current public session version

### Requirement: Resumable projected event stream
The system SHALL emit monotonically sequenced public events and SHALL resume after the Client's last acknowledged sequence when retained events are available. If events are no longer retained, it SHALL return an explicit replay gap and support paged history recovery.

#### Scenario: Client reconnects after a temporary outage
- **WHEN** the Client reconnects with the last acknowledged sequence inside the replay window
- **THEN** the system replays only later events in order and the SDK suppresses duplicates

#### Scenario: Replay window has expired
- **WHEN** the requested sequence is older than retained events
- **THEN** the system emits a replay gap and the Client can reconstruct public history through the paged message API

### Requirement: Safe public event projection
The system SHALL expose only allow-listed participant events and MUST redact server paths, credentials, environment data, internal developer instructions, raw tool input/output, native Agent session identifiers, and administrative diagnostics.

#### Scenario: Internal tool event contains sensitive data
- **WHEN** the canonical session emits a tool event containing a local path or credential-like value
- **THEN** the public stream omits the internal event or replaces it with a safe progress summary

### Requirement: Explicit recoverable errors
The protocol SHALL classify authentication expiry, grant revocation, owner pause, host offline, rate limit, version conflict, replay gap, invalid attachment, and server failure as distinct stable error codes with a retryability flag.

#### Scenario: Forge host becomes unavailable
- **WHEN** the Client loses connectivity without an authentication rejection
- **THEN** the SDK preserves its grant state, retries with bounded backoff, and reports an offline recovery state instead of forcing logout

