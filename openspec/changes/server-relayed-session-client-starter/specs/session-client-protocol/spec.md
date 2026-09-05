## MODIFIED Requirements

### Requirement: Grant-scoped transport authentication
The system SHALL authenticate direct REST calls with grant-scoped access and SHALL use a short-lived, single-use connection ticket for WebSocket establishment. It SHALL also support an explicitly configured trusted business-server Relay that authenticates independently, maps its own authenticated principal to the Grant subject, and keeps all Forge credentials server-side. Remote direct transport MUST use HTTPS/WSS and validate an explicitly allowed Origin; service-to-service transport MUST use authenticated, access-controlled networking and SHOULD use TLS or mTLS.

#### Scenario: Trusted Relay opens a connection
- **WHEN** a configured Relay authenticates, maps a business principal to the Grant subject, and requests an upstream connection ticket
- **THEN** Forge binds the connection to the same grant, participant, session, and public protocol without exposing upstream credentials to the browser

#### Scenario: Untrusted Relay attempts pairing
- **WHEN** Relay authentication is missing, invalid, disabled, or mapped to a different subject
- **THEN** the request is rejected without consuming the invitation or disclosing the session

