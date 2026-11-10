## ADDED Requirements

### Requirement: Trusted local proxy attachment origin

The system SHALL accept a chat attachment CORS request when it arrives from a loopback proxy and its Origin exactly matches the original scheme and host declared by that proxy. This dynamic same-origin rule SHALL apply only to attachment upload and SHALL NOT expand external-login origins.

#### Scenario: Mobile browser uses the LAN Forge address

- **WHEN** an attachment preflight arrives from a loopback proxy
- **AND** Origin equals the combination of `X-Forwarded-Proto` and `X-Forwarded-Host`
- **THEN** the system returns the matching allowed Origin and permits the attachment request to continue

#### Scenario: Forwarded origin does not match

- **WHEN** Origin differs from the forwarded scheme or host
- **THEN** the system rejects the preflight with HTTP 403

#### Scenario: Forwarding source is not local

- **WHEN** a non-loopback client supplies matching forwarded headers for an unconfigured Origin
- **THEN** the system rejects the preflight with HTTP 403

#### Scenario: External login remains restricted

- **WHEN** an unconfigured LAN Origin requests the external-login endpoint through the local proxy
- **THEN** the system rejects the request under the existing explicit Origin whitelist
