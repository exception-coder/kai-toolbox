# Forge runtime tunnel

## ADDED Requirements

### Requirement: Managed named tunnel follows the project

When local configuration enables the Cloudflare tunnel, Forge SHALL start the existing named tunnel as part of project startup and full reload, and SHALL allow bounded process recovery after an unexpected exit. A repeated start SHALL NOT create a duplicate online tunnel. A full stop SHALL stop it.

#### Scenario: Full project reload

- **WHEN** the enabled project completes a full reload
- **THEN** Forge launches the named tunnel from the existing local configuration and exposes its process state

### Requirement: Optional independently bound tunnel connectors

Forge SHALL support two explicitly source-bound connectors using the same existing named tunnel configuration. The second connector SHALL use HTTP/2. Forge SHALL reject duplicate source addresses and addresses detected on the same interface, and SHALL preserve the available connector when one source address is unavailable. The operator SHALL supply and verify independent egress routes. Stopping the tunnel SHALL stop both managed connectors.

#### Scenario: One connector is available

- **WHEN** replica mode is enabled and only one connector is online
- **THEN** Forge exposes both process states and uses the public homepage and API checks to determine overall reachability

### Requirement: Public origin participates in startup readiness

When the tunnel is enabled, Forge SHALL report project startup success only after the public homepage and `/api/tools` both reach their origins. A failed tunnel launch SHALL provide a diagnostic path; an unreachable public origin SHALL remain pending until the startup timeout.

#### Scenario: Tunnel process is online but public origin is unavailable

- **WHEN** local services respond and the tunnel process is online but the public API does not respond successfully
- **THEN** startup remains pending and displays the public origin state
