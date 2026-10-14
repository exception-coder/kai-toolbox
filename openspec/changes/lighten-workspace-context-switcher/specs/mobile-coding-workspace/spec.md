## ADDED Requirements

### Requirement: Lightweight workspace context switcher
The mobile session title SHALL open a context switcher containing the current session identity, Agent status, direct permission-aware conversation mode choices and an entry to the existing session list. It SHALL NOT contain page tabs or tool navigation.

#### Scenario: Choose the current mode
- **WHEN** the user selects the current conversation mode
- **THEN** the switcher closes and restores focus without changing the route or creating a session

#### Scenario: Change conversation mode
- **WHEN** the user chooses an allowed other mode
- **THEN** the switcher closes and the existing mode transition preserves session routing and applicable drafts

#### Scenario: Unavailable mode
- **WHEN** the account lacks access to a mode
- **THEN** that mode is disabled with an explanation and cannot be selected

#### Scenario: Open workspace list
- **WHEN** the user selects switch workspace
- **THEN** the original session list opens without duplicating workspace data

### Requirement: Mobile work views belong to more
The mobile tools menu SHALL provide work views on demand inside the work/progress category using the existing session view definitions and state.

#### Scenario: Select a session view
- **WHEN** the user enters work/progress and selects a destination
- **THEN** the original view opens, the menu closes and the composer draft remains available

#### Scenario: No session
- **WHEN** no session is selected
- **THEN** only the global session board is offered in work views

#### Scenario: Restore desktop layout
- **WHEN** the viewport becomes desktop width
- **THEN** the mobile context switcher closes and desktop tabs and mode controls remain available
