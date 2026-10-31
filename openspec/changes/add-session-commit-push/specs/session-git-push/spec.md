## ADDED Requirements

### Requirement: Read-only branch history browsing
The session commits dialog SHALL offer branch labels scoped to the selected authorized repository, including local and cached remote branches, defaulting to the current working branch. Selecting a label SHALL only read that branch's commits without checkout, fetch or changes to working files or index.

#### Scenario: Browse another branch and recover
- **WHEN** a developer selects another branch or repository and earlier requests finish late
- **THEN** commits and detail SHALL belong only to the current selection, and sync actions SHALL only appear for the working branch
- **AND** refresh SHALL preserve an existing selection or explicitly return to the working branch if the selected branch was removed

#### Scenario: Empty history or unavailable branch service
- **WHEN** the current branch has no commits or HEAD is detached
- **THEN** an explicit current entry SHALL remain available
- **WHEN** the branch service is unavailable
- **THEN** current-branch history SHALL remain usable with an explicit fallback message and retry action

### Requirement: Push from session commit history
The session commit history SHALL offer a snapshot-bound branch push for its selected repository, reuse the existing project Git push rules through a shared port, and resolve repository paths from the session on the server.

#### Scenario: Confirm the displayed branch target
- **WHEN** the user opens push for an eligible selected repository
- **THEN** the panel shows branch, fixed HEAD, outgoing count and sanitized destinations and requires an explicit confirmation before pushing that HEAD without force

#### Scenario: Ineligible or stale repository
- **WHEN** the repository is excluded, lacks an upstream, is detached, is behind upstream, or the displayed snapshot changes
- **THEN** the server refuses push with a recoverable explanation and does not silently pick another repository or target

#### Scenario: Pending and repeated action
- **WHEN** push is pending
- **THEN** duplicate push, repository switching and dismissal are prevented and session and project entry points share the same canonical repository lock

#### Scenario: Success or uncertain failure
- **WHEN** push finishes or fails without a confirmed result
- **THEN** the panel reports the actual outcome, refreshes its snapshot without automatically retrying, and tells the user to check remote state before retrying uncertain failures

#### Scenario: Mobile and keyboard access
- **WHEN** commit history is used in a narrow viewport or with a keyboard
- **THEN** controls and long destinations reflow without horizontal overflow, dialog focus remains inside and closing restores the trigger context
