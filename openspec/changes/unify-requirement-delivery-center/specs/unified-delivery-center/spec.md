## ADDED Requirements

### Requirement: One delivery entry
The system SHALL expose one menu using the delivery center visual language and preserve the old delivery URL through a parameter-preserving redirect.

#### Scenario: Legacy bookmark
- **WHEN** a user opens the legacy delivery URL with query parameters
- **THEN** the user reaches the unified center with those parameters and the existing reqpool permission guard

### Requirement: Complete requirement projection
The system SHALL show registered requirements with or without PRD evidence and unregistered PRD sessions without duplicating an explicitly linked PRD.

#### Scenario: Mixed sources
- **WHEN** one registered requirement links a PRD and another has no PRD and another PRD has no registration
- **THEN** all three distinct items are visible with accurate source and evidence labels

### Requirement: Existing workflow access
The system SHALL retain registration, import, assignment, deadlines, analysis, document actions, development, verification and deletion through existing endpoints.

#### Scenario: Stage inspection
- **WHEN** the user selects a delivery stage
- **THEN** the existing stage workflow opens for that PRD identity

#### Scenario: Early requirement
- **WHEN** an item has no delivery evidence
- **THEN** management and clarification remain accessible without fabricated progress

### Requirement: Recoverable responsive workspace
The system SHALL provide project and keyword filtering, preserve available data during source failure and reflow the workspace on mobile.

#### Scenario: Evidence unavailable
- **WHEN** the evidence request fails but registered requirements load
- **THEN** the requirements remain visible with an explicit retry action

#### Scenario: Empty filter
- **WHEN** filters match nothing
- **THEN** a clear-filter action restores the visible collection
