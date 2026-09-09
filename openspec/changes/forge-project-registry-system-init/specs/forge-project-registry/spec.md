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
