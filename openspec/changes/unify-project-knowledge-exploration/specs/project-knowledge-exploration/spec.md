## ADDED Requirements

### Requirement: Unified project exploration

The system SHALL expose business and cross-project knowledge exploration from the project library without requiring fixed document category quotas.

#### Scenario: Open knowledge entry
- **WHEN** a registered project opens knowledge exploration
- **THEN** business exploration and cross-project relationship exploration share one entry, with Graphify prerequisites and recoverable errors

#### Scenario: Unregistered local project
- **WHEN** a local directory has no registered identity
- **THEN** the entry offers project registration and does not infer knowledge readiness from legacy directory counts

### Requirement: Validated cross-project candidates

The system SHALL accept two to four distinct registered projects and publish only bounded candidate relationships with validated source evidence for both endpoints.

#### Scenario: Successful exploration
- **WHEN** selected projects have valid graphs and stable source baselines and the Agent returns valid relationships
- **THEN** an independently versioned topology snapshot records participants, source evidence, scope, gaps and candidate confidence without replacing domain snapshots

#### Scenario: Invalid selection or fabricated citation
- **WHEN** projects are duplicated, absent, outside the count limit or a relation references unavailable evidence
- **THEN** the request or result is rejected and no fabricated relationship is published

#### Scenario: Concurrent change or failure
- **WHEN** a participant changes during exploration or an Agent fails
- **THEN** the run becomes FAILED and the previous snapshot remains available

#### Scenario: Repeated start and interrupted run
- **WHEN** another exploration owns the anchor lock or a persisted RUNNING run has lost its lock
- **THEN** a repeated start returns conflict and an interrupted run becomes recoverable failure respectively

#### Scenario: Evidence freshness
- **WHEN** a participant source, graph or registered path differs from the snapshot
- **THEN** the UI labels the snapshot stale and never presents it as confirmed business truth

### Requirement: Unified readonly knowledge query

The system SHALL expose knowledge_query through the readonly MCP, preserve legacy aliases and existing review and inheritance semantics, and reject writes.

#### Scenario: Query both sources
- **WHEN** the Agent selects all sources for a supported readonly action
- **THEN** results remain attributed to domain or topology, including independent unavailable or error states

#### Scenario: Mutation rejected
- **WHEN** the action requests reload or a non-whitelisted tool
- **THEN** execution is rejected before contacting a knowledge engine

#### Scenario: Reviewed knowledge
- **WHEN** a domain candidate or context query is requested
- **THEN** the existing engine evaluates review revision and inheritance without Forge promoting code-derived drafts
