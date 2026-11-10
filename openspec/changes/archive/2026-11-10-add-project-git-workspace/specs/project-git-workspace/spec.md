## ADDED Requirements

### Requirement: Inspect registered project Git workspace
The project registry SHALL expose a Git workspace view for a selected registered project, showing branch, HEAD, upstream, local ahead/behind counts, changed files and up to 100 outgoing commits, explicitly identifying the local tracking reference basis.

#### Scenario: Changed and outgoing work
- **WHEN** the selected repository has staged, unstaged, untracked or renamed paths and commits ahead of its upstream
- **THEN** the view shows exact paths and index/worktree states separately from outgoing commit hashes and subjects, including the total outgoing count

#### Scenario: Empty or unsupported repository state
- **WHEN** the project is unavailable, not a repository root, unborn, detached or lacks a valid upstream
- **THEN** the view shows a recoverable explanation and does not offer an executable push

### Requirement: Push only the displayed commit to the displayed destination
The server SHALL accept pushes only for registered repositories with valid configured upstream and configured push destinations, verify the displayed snapshot including all destinations, serialize pushes per repository, and execute a bounded ordinary push of the exact displayed SHA to the upstream branch at every configured destination without force, automatic commits or additional refs.

#### Scenario: Different read and write destinations
- **WHEN** the configured fetch address is not included in the push destinations
- **THEN** push is disabled with guidance to verify the destination in local Git, rather than treating the fetch tracking ref as evidence for another destination

#### Scenario: Multiple configured push destinations
- **WHEN** a remote has multiple push addresses such as GitHub and Gitee
- **THEN** the page displays all sanitized destinations and one Push sends the displayed SHA to each address

#### Scenario: Partial multi-destination failure
- **WHEN** one destination accepts a push and another rejects it
- **THEN** the response identifies confirmed successful and failed destinations, does not claim complete success, and preserves outgoing tracking state so the user can retry after resolving the failure

#### Scenario: Successful ordinary push
- **WHEN** the user clicks Push on a current eligible snapshot
- **THEN** the configured remote branch receives that SHA, the UI reports success and refreshes workspace data while local uncommitted files remain unchanged

#### Scenario: Stale or ineligible snapshot
- **WHEN** the branch, HEAD or destination changed, no outgoing commits exist for a single destination, or the repository is behind upstream
- **THEN** the server rejects push with guidance to refresh or synchronize in Git

#### Scenario: Retry a secondary destination after fetch
- **WHEN** the fetch upstream already contains HEAD but another configured push destination still needs synchronization
- **THEN** multi-destination Push remains available and repeats the fixed-SHA ordinary push without requiring a new local commit

#### Scenario: Remote rejection or timeout
- **WHEN** authentication, hooks, network, non-fast-forward checks or timeout prevent confirmed success
- **THEN** the UI shows a sanitized error and allows recovery, does not claim success, and timeout guidance asks the user to check remote state before retrying
