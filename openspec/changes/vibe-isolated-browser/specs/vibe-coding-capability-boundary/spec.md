## ADDED Requirements

### Requirement: Isolated public link navigation in a development turn
Forge SHALL allow an ordinary Codex App Server development turn to use a Forge-managed temporary browser for an explicitly requested public HTTPS navigation. It SHALL scope the tool to the current user's request and isolate browser state from other sessions and accounts.

#### Scenario: Open a page and follow its visible link
- **WHEN** the user specifies a public page and asks to click a named link
- **THEN** the tool opens the page, clicks the matching visible link and reports the observed destination URL
- **AND** the temporary browser closes after the operation

#### Scenario: Request exceeds the turn's scope
- **WHEN** the model substitutes another start address or another link, or navigation would access a private network target
- **THEN** the tool rejects the action and does not report a successful destination

#### Scenario: Navigation cannot be verified
- **WHEN** the link is ambiguous or the browser cannot complete the requested navigation
- **THEN** the tool reports the failure in the originating turn
