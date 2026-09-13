## ADDED Requirements

### Requirement: Portable initialization with truthful source coverage
FULL and SYNC SHALL accept ordinary multi-megabyte source files with bounded streaming memory, exclude generated out directories, and report concrete incomplete scan reasons before refusing publication.

#### Scenario: Large library and generated copy
- **WHEN** a readable 3 MiB JavaScript library and a generated copy under out/artifacts exist
- **THEN** the library participates in the source fingerprint, the generated copy is excluded, and neither triggers the old 2 MiB incomplete-scan error

#### Scenario: Source coverage cannot be verified
- **WHEN** a source is unreadable or exceeds the documented size, depth or count safety bound
- **THEN** the update fails with a concrete reason and retains the original graph and profile

#### Scenario: Full initialization recovers an oversized old graph
- **WHEN** an existing graph is larger than the former 128 MiB parsing bound but within the 1 GiB baseline fingerprint bound
- **THEN** FULL may build a new candidate while streaming the old graph fingerprint and retaining disk-backed rollback; it SHALL NOT delete the old graph to bypass validation

#### Scenario: Managed runtime on supported operating systems
- **WHEN** a compatible graphifyy 0.9.16 interpreter is available in a trusted uv or configured environment on Windows, Ubuntu or macOS
- **THEN** Forge invokes its absolute executable with separate arguments without requiring shell activation or a project-provided executable

#### Scenario: Explicit runtime is incompatible
- **WHEN** the operator configures an unavailable or incompatible interpreter
- **THEN** initialization reports the runtime failure and a pinned installation recovery action without silently choosing another interpreter or upgrading packages

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
### Requirement: Preserve native identity while reusing path resolutions
The bridge SHALL reuse native source identity results within one source-stable extraction without replacing Graphify disambiguation rules. The native helper SHALL be restored after success or failure, and path caches SHALL be bounded and reset between runs.

#### Scenario: Repeated source paths on Windows
- **WHEN** many nodes and edges refer to the same source files
- **THEN** cached extraction produces the same disambiguated nodes and relationships as native uncached extraction while avoiding repeated filesystem resolution for identical source keys

### Requirement: Publish usable graph evidence with explicit coverage gaps
A native zero-node-source warning SHALL be recorded as incomplete structural coverage rather than an environment failure. The graph SHALL retain missing source paths, the CODE asset and Graphify stage SHALL remain PARTIAL, and the published profile SHALL remain DEGRADED. Input freshness SHALL be distinct from structural completeness. Other extraction failures, invalid graphs and changed inputs SHALL still prevent publication.

#### Scenario: A data file produces no structural nodes
- **WHEN** native extraction succeeds but a source such as an empty JSON document has no graph node
- **THEN** initialization may publish the valid graph and profile with the exact missing source recorded, without claiming complete coverage or AI_READY


#### Scenario: Native large graph and unresolved external links
- **WHEN** a valid native candidate exceeds 128 MiB but stays within the native 512 MiB bound and contains unresolved endpoints
- **THEN** Java reads its summary as a stream, Graphify native export normalization supplies valid links, unresolved links are preserved as explicit coverage evidence, and completeness remains PARTIAL
