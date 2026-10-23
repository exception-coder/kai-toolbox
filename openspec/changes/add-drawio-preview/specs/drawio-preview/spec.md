## ADDED Requirements

### Requirement: Browser-only draw.io rendering
The system SHALL render supported draw.io files using locally hosted frontend resources without an additional backend rendering service.

#### Scenario: Open a multi-page diagram
- **WHEN** a user selects or drops a valid `.drawio` or `.drawio.xml` file
- **THEN** the existing preview displays its diagrams with page selection, zoom, fit and fullscreen controls
- **AND** the original file remains unchanged

#### Scenario: Invalid or oversized diagram
- **WHEN** the input is empty, damaged, truncated or exceeds parsing limits
- **THEN** the preview explains the failure and provides retry or source inspection instead of displaying incomplete results

#### Scenario: Isolated rendering
- **WHEN** a diagram includes external resources or links
- **THEN** the preview blocks external resource requests and link navigation
- **AND** renderer messages are accepted only from the expected frame instance
