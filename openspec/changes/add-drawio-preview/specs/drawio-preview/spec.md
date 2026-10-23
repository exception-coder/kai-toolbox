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

### Requirement: Preview diagrams directly from AI replies
The system SHALL open local draw.io links in AI replies as an in-place read-only diagram dialog using the existing controlled project path access.

#### Scenario: Click a diagram link
- **WHEN** a user clicks an absolute or relative local draw.io file link in a session reply
- **THEN** the system reads the complete UTF-8 file up to 5 MiB within existing allowed project directories
- **AND** shows the shared diagram preview without leaving the conversation or launching a desktop program
- **AND** closing restores the original message focus without scrolling

#### Scenario: Read rejected or cancelled
- **WHEN** a file is missing, outside allowed paths, oversized or not UTF-8
- **THEN** an error is shown with retry and close actions
- **AND** the system does not fall back to an alternate read or open path
- **WHEN** the dialog closes or its session changes
- **THEN** an outstanding request is cancelled and its stale result is not displayed
