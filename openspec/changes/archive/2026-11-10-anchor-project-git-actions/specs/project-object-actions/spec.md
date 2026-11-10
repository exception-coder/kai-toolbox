## ADDED Requirements

### Requirement: Project anchored Git operations
The registry SHALL expose Git operations on each project object through a dialog without a separate Git navigation tab or a repeated project selector.

#### Scenario: Open selected project
- **WHEN** the user opens Git from a project row
- **THEN** only that project is loaded and its name and path remain visible, with no nested interactive links

#### Scenario: Close and return
- **WHEN** the dialog closes while no push is running
- **THEN** focus returns to its trigger and the list search, filter and position remain available

#### Scenario: Legacy Git link
- **WHEN** a user follows section=git
- **THEN** they return to all projects and choose Git on an explicit project without automatic Git execution

### Requirement: Dialog operation continuity
The dialog SHALL preserve existing Git snapshot and push rules, recoverable failures, keyboard access and narrow-screen usability.

#### Scenario: Push in flight
- **WHEN** a push request is pending
- **THEN** duplicate push and dialog dismissal are prevented with an explicit waiting message until a result is available

#### Scenario: Read failure
- **WHEN** the project cannot be read
- **THEN** the dialog shows a recoverable error and permits closing without representing failure as a clean repository
