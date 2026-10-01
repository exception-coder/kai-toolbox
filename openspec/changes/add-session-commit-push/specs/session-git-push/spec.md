## ADDED Requirements

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
