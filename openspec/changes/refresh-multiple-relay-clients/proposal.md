## Why

Forge Relay currently authenticates one configured ID/Secret. Independent business systems need separate identities that administrators can add, disable and rotate after startup. The existing configuration center already persists overrides and publishes refresh events, so it remains the single configuration facility.

## What Changes

- Register Relay configuration with the existing dynamic configuration center and support independently named, enabled clients.
- Reuse the current configuration CRUD API and persistence; support a custom Relay editor inside the existing page.
- Validate before activation and make additions, removal and credential rotation effective without restart.
- Preserve deployment credentials until explicitly switching to managed clients; an empty managed list must not restore legacy credentials.
- Keep Relay identity in existing invitation exchange audit correlation.
- Do not introduce a new module, external configuration server, draft publication workflow or business-system UI.

## Capabilities

### New Capabilities

- `refreshable-relay-clients`: Multiple Relay identities managed through the existing configuration center with immediate authentication refresh.

### Modified Capabilities

None. The pending server-relayed-session-client-starter change owns the underlying Relay transport contract.

## Impact

Targets: toolbox-common dynamicconfig, tool-claude-chat Relay configuration/authenticator, frontend config-center. Existing SQLite override schema and REST routes remain authoritative. No new dependency or business-system modification is required.

Evidence: DynamicConfigService, RefreshableConfigRegistry, SessionClientProperties, SessionRelayClientAuthenticator; Yoooni One docs/development/client-configuration-guide.md read from its local repository. The supplied hosted page could not be read by web tooling. No unresolved business decision is required for this scope.
