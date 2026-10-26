## ADDED Requirements

### Requirement: Preserve preview links as web operations
Vibe Coding SHALL open same-origin page-preview links in a modal without invoking the local-file API. Query and fragment data SHALL be preserved. Other Forge web routes SHALL remain web links while genuine local files retain their prior behavior.

#### Scenario: A delivery link contains a query
- **WHEN** a user clicks a desktop or phone preview handoff in a reply
- **THEN** a modal SHALL load the existing preview workspace with its route, device, resource and source context intact
- **AND** closing SHALL preserve the conversation and restore focus

### Requirement: Authenticate with a configured runtime resource
An administrator SHALL be able to choose an existing non-production application account before or during preview. Only its resource ID SHALL be sent to the preview service. The service SHALL use the saved credentials in an isolated context and SHALL NOT expose the password in replies, URLs or resource views.

#### Scenario: Open a protected application route
- **WHEN** a preview references a configured resource without an explicit login page
- **THEN** login SHALL start from the protected target route and follow same-origin authentication
- **AND** an unambiguous standard form or SPA login SHALL be supported

#### Scenario: Authentication cannot be established
- **WHEN** multiple password inputs are visible or the target remains a login page
- **THEN** preview SHALL wait for user intervention and SHALL NOT claim READY or submit guessed credentials

### Requirement: Bound the modal preview lifecycle
Repeated clicks and fullscreen changes SHALL reuse the active modal context. Explicit close and reopen SHALL use a new request identity. Session changes and close SHALL release contexts created by that modal, including late creation results.

#### Scenario: User changes runtime account
- **WHEN** the user confirms an account change
- **THEN** the old context SHALL close before a new request starts, with no duplicate submissions
