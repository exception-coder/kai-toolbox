## ADDED Requirements

### Requirement: Code-first domain exploration
The registry SHALL allow Codex or Claude to discover domain drafts using project-scoped Graphify and source evidence without requiring existing domain knowledge or OpenSpec.

#### Scenario: First exploration
- **WHEN** a registered project has usable graph and source evidence and the user starts exploration
- **THEN** a background run exposes progress and produces bounded domain drafts with responsibilities, flows, mappings, citations and unknowns

### Requirement: Evidence validation and recovery
The server SHALL validate structured output and source/graph citations before publishing, preserve the previous snapshot on failure, and expose stale or partial coverage.

#### Scenario: Invalid output or changed source
- **WHEN** output contains an invalid citation or the source changes during exploration
- **THEN** the previous snapshot remains available and the run reports failure

#### Scenario: Missing graph
- **WHEN** no usable graph exists
- **THEN** exploration requests graph initialization and does not fabricate a domain registry

### Requirement: Unified domain context
The domain panel, System Profile evidence and task handoff SHALL reference the same domain snapshot and distinguish inferred meaning from verified source references.

#### Scenario: Existing specification only
- **WHEN** OpenSpec files exist but no exploration result exists
- **THEN** the registry does not present specification files as discovered business domains
