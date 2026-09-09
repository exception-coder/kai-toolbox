## ADDED Requirements

### Requirement: Persistent system identity
Forge SHALL persist project identity, repository metadata, local path, runtime URLs and owner separately from derived code intelligence.

#### Scenario: Register existing directory
- **WHEN** a user registers an existing local directory
- **THEN** Forge assigns a stable ID and returns UNINITIALIZED without starting initialization

#### Scenario: Duplicate canonical directory
- **WHEN** another registration resolves to the same canonical directory
- **THEN** Forge rejects the duplicate and preserves the original identity

### Requirement: Registry workspace
The workspace SHALL show registered systems and recovery actions and provide detail navigation to profile, intelligence, domains, tasks, verification, environment and settings.

#### Scenario: Empty or unavailable registry
- **WHEN** no projects are registered or loading fails
- **THEN** the workspace offers registration or retry respectively without fabricated project metrics

### Requirement: Central project management
The project registry SHALL provide local project discovery, directory configuration and module workspace access within the registry, reusing existing configuration storage and project actions.

#### Scenario: Discover and register locally
- **WHEN** a user searches discovered directories and selects an unregistered project
- **THEN** the registry fills its registration form without navigating to another tool and identifies already registered paths

#### Scenario: Configure directories
- **WHEN** a user changes scan directories in the registry
- **THEN** the corresponding existing configuration is saved, discovery is refreshed and failures remain recoverable in place

#### Scenario: Legacy management link
- **WHEN** a user opens the old project management or module workspace URL
- **THEN** the corresponding registry section opens and its existing capabilities remain accessible
