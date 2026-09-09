## ADDED Requirements

### Requirement: Native incremental structural synchronization
SYNC SHALL use Graphify to detect changed sources and update changed and directly affected structure while preserving unrelated existing graph content.

#### Scenario: Code changes and deletions
- **WHEN** files are edited, added, removed or renamed after initialization
- **THEN** Graphify updates the affected source scope, removes obsolete source nodes and reports changed, reused, deleted and affected counts

#### Scenario: No code changes
- **WHEN** Graphify finds no structural source changes
- **THEN** the graph bytes remain unchanged and the stage reports a no-change result

### Requirement: Safe publication and honest readiness
Graph updates SHALL be staged and validated before publication; failures SHALL retain the last profile and shall not silently fall back to full extraction.

#### Scenario: Missing or invalid baseline
- **WHEN** SYNC has no valid graph and manifest baseline
- **THEN** the run fails with an explicit full-initialization recovery action without replacing existing artifacts

#### Scenario: Extraction failure or concurrent source changes
- **WHEN** extraction fails or inputs change during extraction
- **THEN** the existing graph and last profile are preserved and the run records failure

#### Scenario: Structural update succeeds
- **WHEN** the staged output passes validation
- **THEN** the new profile reports structural coverage separately from semantic and community reanalysis
