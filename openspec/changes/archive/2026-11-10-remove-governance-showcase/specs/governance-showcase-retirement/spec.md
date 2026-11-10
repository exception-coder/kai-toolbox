## ADDED Requirements

### Requirement: Retire the governance showcase
The application SHALL exclude the retired VibeCoding governance presentation from its feature registry, menus, home entries and registered routes, and SHALL NOT bundle its dedicated presentation code or assets.

#### Scenario: Navigate after retirement
- **WHEN** the user opens the application menu or home page
- **THEN** the governance presentation is absent
- **AND** the normal Vibe Coding development feature remains available

#### Scenario: Open a retired bookmark
- **WHEN** the user opens `/showcase/webppt-governance-report`
- **THEN** the route is handled by the existing unmatched-route behavior
- **AND** the deleted presentation is not loaded
