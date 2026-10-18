## ADDED Requirements

### Requirement: Pull updates for the selected session repository
The workspace SHALL offer an explicit fetch-and-preview followed by confirmation to fast-forward the selected repository to a fixed upstream commit.

#### Scenario: Remote updates exist
- **WHEN** the clean selected repository has upstream commits and no divergence
- **THEN** the user sees the branch, sanitized fetch source, incoming count and fixed version before confirmation; confirmation fast-forwards and refreshes commits and push status

#### Scenario: Local work or incompatible state
- **WHEN** files are modified, staged or untracked, Git integration is unfinished, upstream is missing, HEAD is detached, or branches diverge
- **THEN** the server refuses with recovery guidance and never stashes, discards changes, rebases or creates a merge commit

#### Scenario: Repository identity and stale preview
- **WHEN** the selected relation is excluded or removed, or HEAD, branch, upstream configuration or fetched version changes after preview
- **THEN** execution is rejected without selecting another repository or overwriting local files

#### Scenario: Pending and uncertain results
- **WHEN** checking or pulling is pending
- **THEN** duplicate writes, repository switching and dismissal are blocked, push and pull share a canonical repository lock, and uncertain failures require checking actual state before retry

#### Scenario: No updates and accessible controls
- **WHEN** no incoming commits exist or the user cancels confirmation
- **THEN** no working files change, feedback remains visible, keyboard recovery and narrow-screen controls remain usable
