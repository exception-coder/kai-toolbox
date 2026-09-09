## ADDED Requirements

### Requirement: Requirements are organized by lifecycle stage
The system SHALL present the AI requirement hub workspace as ordered lifecycle-stage columns, and each visible root requirement MUST appear in exactly one column matching its current status.

#### Scenario: Mixed requirement statuses
- **WHEN** the workspace contains requirements in multiple statuses
- **THEN** the board shows ordered stage columns with each requirement under its matching stage and an accurate count per column

#### Scenario: Empty stage
- **WHEN** a stage has no matching requirements
- **THEN** its column remains visible with a quiet empty message that preserves the lifecycle context

### Requirement: Requirement notes preserve decision context
Each requirement note SHALL expose the title, current decision signal, project or module context, delivery evidence summary, owner or deadline context, and the highest-priority risk when those fields are enabled.

#### Scenario: Open requirement detail
- **WHEN** the user activates a requirement note
- **THEN** the existing requirement detail workflow opens for that requirement without changing its status

#### Scenario: Optional display fields
- **WHEN** the user disables a configurable display field
- **THEN** the corresponding information is omitted from notes while the requirement remains discoverable and operable

### Requirement: Existing workspace operations remain available
The board SHALL preserve search, decision and status filters, bulk selection, evidence synchronization, priority recalculation, requirement registration, and leader view navigation.

#### Scenario: Filter requirements
- **WHEN** the user applies search or filters
- **THEN** each stage shows only matching requirement branches and the user can clear filters to restore the full board

#### Scenario: Select requirements across columns
- **WHEN** the user selects requirement notes in one or more columns
- **THEN** the existing bulk action bar reflects the selection and supports cancel or delete actions

### Requirement: Board states are responsive and recoverable
The board SHALL remain usable at desktop and mobile widths and MUST distinguish loading, globally empty, filtered-empty, and empty-column states with an appropriate next action where one exists.

#### Scenario: Narrow viewport
- **WHEN** the viewport cannot display all lifecycle columns
- **THEN** the columns remain readable through horizontal navigation without compressing note content below its usable width

#### Scenario: Filter has no matches
- **WHEN** active filters produce no matching requirements
- **THEN** the workspace explains that filters caused the empty result and provides a clear-filter action

### Requirement: Status changes are not implied by visual dragging
The board SHALL NOT expose drag-and-drop status changes until a validated status-transition command and an equivalent non-drag interaction are available.

#### Scenario: User interacts with a note
- **WHEN** the user clicks, taps, or keyboards into a requirement note
- **THEN** the system opens or selects the requirement and does not silently move it to another lifecycle stage
