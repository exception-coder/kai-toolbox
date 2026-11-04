# 项目 Skill

## ADDED Requirements

### Requirement: Single-source project skill guidance
The project SHALL keep one authoritative body per substantive skill and preserve compatible discovery entries.

#### Scenario: Developer starts Forge
- **WHEN** an engine reads forge-startup
- **THEN** it follows forge-runtime and the existing repository authorization and startup configuration documents.

#### Scenario: Supervision skill is provisioned
- **WHEN** the host installs its owned skill
- **THEN** it deploys the entry and its conditional references, reports a matching version and content fingerprint, and preserves conflicting user-owned files.

#### Scenario: Project skills are discovered
- **WHEN** an engine scans the project skills directory
- **THEN** unimplemented design templates are absent and consultation runtime skills retain their original contracts.
