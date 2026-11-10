## ADDED Requirements

### Requirement: Conditional Spring Boot auto-configuration
The Starter SHALL use Spring Boot auto-configuration, a unique `forge.session-relay` property namespace, and conditional beans so it is inert unless explicitly enabled and supplied with a host participant resolver.

#### Scenario: Dependency is added without configuration
- **WHEN** a Spring Boot application includes the Starter but does not enable it
- **THEN** no Relay HTTP or WebSocket endpoint is exposed

### Requirement: Host-owned identity mapping
The Starter SHALL require a resolver of the host's authenticated principal. In default mode it resolves a Forge user ID; with invitation-bound-identity enabled it resolves an isolated local positive binding key and uses the invitation pairing endpoint without fallback. It MUST NOT include a permissive header-based default.

#### Scenario: Anonymous request reaches Relay
- **WHEN** the host cannot resolve an authenticated participant
- **THEN** pairing and bound-session access are denied before any upstream call

### Requirement: Replaceable binding persistence
The Starter SHALL expose a binding-store SPI and SHALL provide a bounded in-memory implementation only as a development default. Production hosts SHALL be able to provide encrypted persistent storage without replacing protocol or controller code.

#### Scenario: Host supplies a store bean
- **WHEN** the application defines its own binding store
- **THEN** auto-configuration backs off and uses the host implementation

### Requirement: Bounded relay resources
The Starter SHALL bound local ticket lifetime, pending frame count, frame bytes, idle connections, and reconnect attempts, and SHALL release both WebSocket sides when either side terminates.

#### Scenario: Browser sends while upstream opens
- **WHEN** public attach/send frames arrive before the upstream WebSocket is ready
- **THEN** the Relay buffers only the configured bounded number and closes the bridge on overflow
