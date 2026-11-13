## ADDED Requirements

### Requirement: Optionally hide changes matching Git ignore rules
The pending changes panel SHALL offer an unchecked-by-default checkbox that hides current paths matching Git ignore rules, including tracked paths. Matching SHALL use the selected repository's native Git rules and SHALL NOT modify files, ignore configuration, index or commits.

#### Scenario: Toggle and restore changes
- **WHEN** the user selects the checkbox
- **THEN** matching entries disappear from the tree and status counts, and the panel shows the hidden count
- **AND** deselecting the checkbox restores matching entries subject to the untracked filter without issuing a write operation

#### Scenario: Native rule precedence and exact paths
- **WHEN** nested, negated, repository-local or global ignore rules apply
- **THEN** matching follows Git's result for the current path and preserves exact filenames and rename origins
- **AND** paths not ignored by Git remain visible unless hidden by the untracked filter

#### Scenario: Every entry is hidden
- **WHEN** the filter hides all pending entries
- **THEN** the panel explains that entries were filtered and can be restored, without claiming a clean worktree

#### Scenario: Ignore matching is unavailable
- **WHEN** the server does not supply matching metadata
- **THEN** the original changes remain available and the filter is disabled with an explanation
- **AND** Git failures or truncated matching results are not represented as successful filtering

### Requirement: Hide untracked changes by default
The pending changes panel SHALL provide a checked-by-default untracked filter for entries whose index and worktree statuses are both `?`. Staged additions SHALL remain visible. The filter SHALL work independently of ignore metadata, combine with the ignore filter, and affect only display.

#### Scenario: Restore untracked files and directories
- **WHEN** the user deselects the untracked filter
- **THEN** untracked entries appear subject to the ignore filter, with tree and counts updated from the same result without another request
- **AND** hiding all entries explains the filtered state rather than claiming a clean worktree
