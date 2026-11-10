## ADDED Requirements

### Requirement: Cloudflare tunnel through Forge
Forge SHALL expose tunnel start, stop and status using Node and the workspace private PM2 instance on Windows, Linux and macOS x64/arm64. Named mode SHALL reuse existing configuration and credentials. Quick mode SHALL expose a supplied HTTP(S) origin using a temporary Cloudflare hostname.

#### Scenario: Existing named configuration
- **WHEN** tunnel start is invoked with valid existing configuration
- **THEN** cloudflared is managed without restarting business services or rewriting DNS and credentials

#### Scenario: Missing credentials
- **WHEN** the named configuration lacks usable local credentials
- **THEN** startup fails explicitly without deleting the remote tunnel

#### Scenario: Existing process
- **WHEN** tunnel start is repeated for an online managed tunnel
- **THEN** its process is reused without duplicate startup

#### Scenario: Public connection fails
- **WHEN** cloudflared is online but public HTTP fails
- **THEN** process status is not treated as public readiness and logs remain available
