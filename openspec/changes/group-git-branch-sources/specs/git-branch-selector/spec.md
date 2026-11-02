## ADDED Requirements

### Requirement: Logical groups preserve exact Git sources
The branch selector SHALL group local and configured remote refs by their case-sensitive logical branch names without merging Git refs or inferring synchronization from names.

#### Scenario: Multiple remotes share a name
- **WHEN** main, origin/main and gitee/main exist
- **THEN** the selector shows one logical group with three independent sources and preserves each exact ref and SHA for actions

### Requirement: Explicit source actions and cached comparison
The selector SHALL expose browsing and switching in source details, preserve worktree preflight and confirmation, and compare actual captured commits independently per source on demand.

#### Scenario: Same name with diverged commits
- **WHEN** local main and origin/main contain distinct commits on both sides
- **THEN** the detail reports actual ahead and behind counts as cached local evidence and does not claim live remote synchronization

#### Scenario: Existing local branch
- **WHEN** the selected remote source already has a same-name local branch
- **THEN** the selector directs switching through the local source without overwriting it or rebinding its upstream
