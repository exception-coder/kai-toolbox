## ADDED Requirements

### Requirement: Business-server mediated pairing
The system SHALL allow an authenticated and configured business server to exchange a one-time invitation on behalf of a business principal mapped to the invitation's Forge subject. The browser MUST NOT be allowed to assert the Forge subject or receive upstream credentials.

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

