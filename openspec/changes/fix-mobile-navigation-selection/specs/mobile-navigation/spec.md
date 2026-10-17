## ADDED Requirements

### Requirement: Dismiss navigation on an accepted selection

The mobile navigation SHALL close immediately for an ordinary current-window feature or brand selection, including the current route and routes whose modules are still loading.

#### Scenario: Select the current feature

- **WHEN** the user selects the active feature
- **THEN** the drawer closes and the existing page and session remain unchanged

#### Scenario: Select a slow-loading feature

- **WHEN** the selected feature has not finished loading
- **THEN** the drawer closes before module readiness and normal routing continues

### Requirement: Keep recovery and browser behavior

The navigation SHALL provide an explicit close action, restore its opener when available, dismiss before opening search, and retain modified-link behavior.

#### Scenario: Open search from navigation

- **WHEN** the user selects search
- **THEN** the navigation closes and the existing command palette opens without the navigation modal blocking it

#### Scenario: Open in another tab

- **WHEN** the user uses a browser modifier to open a link separately
- **THEN** the drawer does not consume that action or force current-window routing
