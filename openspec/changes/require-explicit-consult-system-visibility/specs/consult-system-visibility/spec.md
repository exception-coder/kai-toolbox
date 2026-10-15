## ADDED Requirements

### Requirement: Explicit visibility for discovered systems
The consultation graph SHALL display a discovered project only when its saved system preference explicitly marks it visible. Discovery SHALL NOT imply visibility.

#### Scenario: Add a scan root
- **WHEN** a scan root introduces new projects without saved preferences
- **THEN** those projects remain absent from the graph and unselected in configuration
- **AND** previously visible systems retain their aliases and display preferences

#### Scenario: Mark a project visible
- **WHEN** an administrator marks a project visible and saves configuration
- **THEN** the refreshed graph includes that project and other unselected projects remain hidden

### Requirement: Recoverable visibility loading
The page SHALL distinguish loading, failure and an empty selection without treating unavailable preferences as approval to show discovered projects.

#### Scenario: Preferences pending or failed
- **WHEN** preference loading is pending or fails
- **THEN** discovered projects do not flash into the graph and configuration editing is unavailable
- **AND** failure offers a retry without writing preferences

#### Scenario: No systems selected
- **WHEN** preferences load successfully with no visible projects
- **THEN** the page explains that systems must be marked visible and administrators can open the existing configuration
