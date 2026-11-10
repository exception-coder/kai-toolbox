## ADDED Requirements

### Requirement: One delivery entry
The system SHALL expose one AI Delivery Center product menu, treat specification exploration as an in-context stage capability, and preserve legacy delivery and specification URLs for compatible deep links.

#### Scenario: Legacy bookmark
- **WHEN** a user opens the legacy delivery URL with query parameters
- **THEN** the user reaches the unified center with those parameters and the existing reqpool permission guard

#### Scenario: Product navigation
- **WHEN** a user browses the primary feature menu or home entry collection
- **THEN** AI Delivery Center is the single requirement-to-delivery product entry and Specification Workspace is not shown as a separate product menu

#### Scenario: Register and continue
- **WHEN** a user completes quick, standard, or Feishu-backed registration
- **THEN** the user remains in AI Delivery Center and the created requirement specification clarification opens in context after evidence refresh

#### Scenario: Historical specification deep link
- **WHEN** a saved link targets an existing specification session
- **THEN** the compatibility specification workspace remains routable without restoring a separate product menu

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
