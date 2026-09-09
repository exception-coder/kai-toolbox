## ADDED Requirements

### Requirement: Requirements are organized by lifecycle stage
The system SHALL adapt the AI requirement hub presentation to workload density while preserving ordered lifecycle stages, and each visible root requirement MUST appear exactly once in the active presentation.

#### Scenario: Mixed requirement statuses
- **WHEN** more than five visible root requirements require broad comparison
- **THEN** the board shows ordered stage columns with each requirement under its matching stage and an accurate count per column

#### Scenario: Sparse workload
- **WHEN** one to five visible root requirements are available
- **THEN** the workspace shows one deterministic current focus, an AI activity narrative, lifecycle counts, and the remaining recent tasks without rendering empty stage columns

### Requirement: Current focus explains active work
The workspace SHALL explain what the focused requirement is, where it sits in the delivery path, what the AI or workflow is currently doing, and the next useful action using only existing observable state.

#### Scenario: Focused requirement has active background work
- **WHEN** its PRD, plan, or code analysis status is running
- **THEN** the focus area identifies that active operation without inventing additional events

#### Scenario: Focused requirement is blocked or incomplete
- **WHEN** no background operation is running and a known requirement or delivery gap exists
- **THEN** the focus area explains the gap and names the next recoverable action

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

#### Scenario: Requirement detail on a narrow viewport
- **WHEN** the user opens requirement detail on a mobile-width viewport
- **THEN** metadata and Agent state reflow to a single reading column, long text wraps without horizontal overflow, and primary actions remain full-width touch targets

#### Scenario: Filter has no matches
- **WHEN** active filters produce no matching requirements
- **THEN** the workspace explains that filters caused the empty result and provides a clear-filter action

### Requirement: Status changes are not implied by visual dragging
The board SHALL NOT expose drag-and-drop status changes until a validated status-transition command and an equivalent non-drag interaction are available.

#### Scenario: User interacts with a note
- **WHEN** the user clicks, taps, or keyboards into a requirement note
- **THEN** the system opens or selects the requirement and does not silently move it to another lifecycle stage
