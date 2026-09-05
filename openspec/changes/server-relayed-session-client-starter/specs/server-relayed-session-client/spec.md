## ADDED Requirements

### Requirement: Business-server mediated pairing
The system SHALL allow authenticated configured business servers to exchange invitations through the existing subject-mapped endpoint or an explicit invitation-bound pairing endpoint. The latter resolves the Forge subject from the invitation Grant and accepts a local participant key solely for Relay audit correlation. Invitation possession through a trusted authenticated host delegates access; expiration, revocation and atomic single consumption MUST still be enforced. Browsers MUST NOT assert Forge subjects or receive upstream credentials.

#### Scenario: Invitation-bound pairing
- **WHEN** a trusted Relay submits an unused invitation and a positive local participant key
- **THEN** Forge resolves the Grant subject, validates current access and consumes the invitation once, retaining the Relay and local key in its audit correlation

#### Scenario: Valid server-mediated pairing
- **WHEN** a trusted Relay authenticates and exchanges an unused invitation for its mapped Forge subject
- **THEN** Forge consumes the invitation and returns grant-scoped credentials only to that Relay

#### Scenario: Browser or Relay asserts another subject
- **WHEN** credentials are absent or the mapped subject does not match the Grant
- **THEN** Forge denies the exchange without revealing session details

### Requirement: Same-origin REST and WebSocket relay
The Relay SHALL expose the participant REST resources and WebSocket protocol on the business application's origin while connecting upstream to the bound Forge Session Client API.

#### Scenario: HTTPS business client connects
- **WHEN** an authenticated browser requests a local connection ticket and opens the business application's WSS endpoint
- **THEN** the Relay consumes the local ticket once, opens the bound upstream Forge WebSocket, and forwards only the public protocol

### Requirement: Server-only credential custody
The Relay SHALL keep Forge access tokens, service credentials, upstream tickets, URLs, and binding metadata on the server and SHALL NOT include them in browser responses, URLs, logs, or public events.

#### Scenario: Browser inspects pairing response
- **WHEN** pairing succeeds
- **THEN** the response contains only a non-sensitive bound-session summary and no upstream credential

### Requirement: Isolated lifecycle and failure handling
Bindings SHALL be isolated by Relay client and mapped principal. Ticket replay, missing binding, grant revocation, upstream unavailability, oversized frames, and either-side disconnect MUST fail closed and terminate the affected bridge without affecting other principals.

#### Scenario: Upstream grant is revoked
- **WHEN** Forge rejects or closes a relayed connection because its Grant was revoked
- **THEN** the Relay closes the corresponding downstream connection and does not reconnect indefinitely
