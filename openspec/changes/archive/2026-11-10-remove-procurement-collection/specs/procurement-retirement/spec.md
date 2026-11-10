## ADDED Requirements

### Requirement: Procurement is excluded from Forge

Forge SHALL exclude procurement collection from frontend feature registration, generated menus, backend modules and dedicated scripts.

#### Scenario: Build Forge after retirement

- **WHEN** Forge is built from the retired source
- **THEN** no procurement menu or frontend route is registered
- **AND** the host artifact contains no procurement module
- **AND** dedicated procurement capture, discovery and import scripts are absent

### Requirement: Preserve shared services and historical data

Retirement SHALL preserve shared browser and LLM services and SHALL NOT delete historical procurement data or private configuration.

#### Scenario: Apply the source removal

- **WHEN** the procurement implementation and bundled model entry are removed
- **THEN** shared services remain configured
- **AND** no database cleanup or private configuration mutation is performed
