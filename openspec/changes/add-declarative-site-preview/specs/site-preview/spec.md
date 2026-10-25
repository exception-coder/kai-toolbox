## ADDED Requirements

### Requirement: Explicit site preview declaration
Vibe Coding SHALL render a complete top-level `site-preview` JSON code fence with a valid external HTTP(S) url and optional title as a clickable preview entry. Incomplete fences, nested code examples and ordinary links SHALL retain their existing behavior. Invalid declarations SHALL show recoverable feedback without executing HTML.

#### Scenario: User opens a declared site
- **WHEN** a user clicks a valid site declaration
- **THEN** a modal SHALL load the site without changing the current route and SHALL offer fullscreen, restore size, refresh, close and new-window actions
- **AND** before clicking the site SHALL NOT be loaded

### Requirement: Preserve session context and embedding boundaries
The modal SHALL preserve its iframe across streamed tail updates and size changes, unload on close or session change, and return focus on close. It SHALL reject executable URLs, URL credentials and Forge same-origin embedding, and SHALL NOT inject stored credentials or proxy target responses.

#### Scenario: Embedding result cannot be confirmed
- **WHEN** a browser cannot embed or authenticate the external page, or loading exceeds the bounded waiting interval
- **THEN** the modal SHALL retain close, refresh where applicable, and new-window recovery without claiming successful loading or login

#### Scenario: HTTPS workbench and HTTP target
- **WHEN** an HTTPS workbench receives an HTTP site declaration
- **THEN** it SHALL offer new-window recovery without creating a mixed-content iframe
