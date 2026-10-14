## ADDED Requirements

### Requirement: Purpose-based tool categories
The session tools menu SHALL expose prioritized shortcuts and five purpose-based categories without repeating equivalent destinations.

#### Scenario: Mobile root menu
- **WHEN** the user opens mobile session tools
- **THEN** new session and session list appear as shortcuts and the root contains work/progress, files/projects, session/sharing, reading/display and runtime/maintenance categories
- **AND** low-frequency commands are not rendered in the root

#### Scenario: Enter a category
- **WHEN** the user selects a category
- **THEN** only that category content appears with a fixed back entry in the same overlay

#### Scenario: No selected session
- **WHEN** no session is selected
- **THEN** session/sharing is disabled with an explanation and other categories expose only applicable existing capabilities

### Requirement: Recoverable tool navigation
The menu SHALL preserve session context, drafts, permissions and operation confirmations while allowing keyboard and touch recovery.

#### Scenario: Return or escape
- **WHEN** the user returns from a category or presses Escape
- **THEN** the root is restored with focus on the original category
- **AND** Escape from the root closes the menu and focuses its trigger

#### Scenario: Reopen after starting a draft
- **WHEN** the user opens tools after displaying the new-session form
- **THEN** the form collapses, its unfinished choices are retained and the menu opens at its root

#### Scenario: Guided navigation
- **WHEN** the existing feature tour locates a category
- **THEN** the category is displayed directly without stealing the tour focus or changing the underlying operation
