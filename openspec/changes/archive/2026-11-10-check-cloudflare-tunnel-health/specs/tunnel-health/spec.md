# Tunnel health

## ADDED Requirements

### Requirement: Distinguish process and public readiness

Forge SHALL report the managed tunnel process separately from public page and API reachability for a named Cloudflare tunnel.

#### Scenario: Process online and routes reachable

- **WHEN** the managed process is online and both configured public homepage and API routes respond through the tunnel
- **THEN** tunnel status reports public readiness

#### Scenario: Origin unavailable

- **WHEN** the process is online but either public route times out or returns a gateway/server error
- **THEN** tunnel status reports the failing route and tunnel check exits nonzero

#### Scenario: Tunnel stopped

- **WHEN** no managed tunnel process exists
- **THEN** tunnel status reports stopped and tunnel check exits nonzero without starting one
