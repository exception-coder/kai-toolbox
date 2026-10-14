## ADDED Requirements

### Requirement: Compact mobile session header
The mobile coding workspace SHALL use a single header row and retain the current session identity, accessible execution status, navigation and object actions. Session views SHALL remain reachable from the session title without a permanently visible second tab row.

#### Scenario: Select an existing view
- **WHEN** the user opens the session title and selects a session view
- **THEN** the existing session view is selected, the overlay closes, focus returns to the trigger, and the composer draft remains available

#### Scenario: No selected session
- **WHEN** the mobile workspace has no selected session
- **THEN** the navigation offers the global session board and conversation mode without unavailable session-specific views

#### Scenario: Directory actions remain reachable
- **WHEN** a session with a working directory is selected on mobile
- **THEN** the tools menu provides the original directory and commit dialog, which returns focus to a visible trigger

#### Scenario: Desktop restoration
- **WHEN** the viewport becomes desktop width
- **THEN** the mobile navigation overlay closes and the original desktop tabs and header controls remain available
