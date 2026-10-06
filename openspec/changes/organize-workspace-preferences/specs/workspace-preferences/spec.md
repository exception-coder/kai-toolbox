## ADDED Requirements

### Requirement: Organize existing workspace preferences by purpose
The system SHALL place focus mode in the View group and workspace personalization in System Settings with a sliders icon. Personalization SHALL organize existing settings into layout/navigation, reading/appearance, and interaction preferences without adding top-level setting entries.

#### Scenario: Reading preferences share existing state
- **WHEN** the user changes tool coloring, skin or tool visibility in personalization
- **THEN** the workspace and its existing shortcuts reflect the same preference without parallel storage

#### Scenario: Interaction settings require explicit action
- **WHEN** the user opens personalization
- **THEN** gesture control is displayed from its current state without starting a camera

#### Scenario: User changes gesture control
- **WHEN** the user explicitly toggles gesture control in personalization
- **THEN** the dialog closes and the system uses the existing gesture and permission flow

#### Scenario: Small viewport
- **WHEN** personalization is opened on a phone
- **THEN** the dialog fits the viewport and its settings and completion action remain reachable by scrolling
