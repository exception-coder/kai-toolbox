## ADDED Requirements

### Requirement: Discover OpenSpec projects and changes
The system SHALL discover OpenSpec-enabled projects only from server-approved workspace or session boundaries and SHALL present each active OpenSpec change as a requirement under its owning project.

#### Scenario: Project has active changes
- **WHEN** the user opens the OpenSpec task board and an approved project resolves to an OpenSpec root
- **THEN** the system displays the project and its active changes with change identifier, task counts, status, last modification time, and snapshot time

#### Scenario: Project is not initialized
- **WHEN** an approved project does not resolve to an OpenSpec root
- **THEN** the system displays an initialization-required state with a recovery action instead of hiding the project or reporting an empty requirement list

#### Scenario: One project cannot be read
- **WHEN** reading one approved project fails or times out
- **THEN** the system preserves successfully loaded projects and displays a project-scoped retryable error

### Requirement: Load change artifacts and structured tasks
The system SHALL load a selected change through schema-aware OpenSpec output and SHALL expose its resolved artifacts and structured tasks without creating a second writable task manifest.

#### Scenario: User selects a change
- **WHEN** the user selects an active change from a project
- **THEN** the system displays its proposal, specification, design and task references when present, together with each task identifier, description and OpenSpec completion fact

#### Scenario: Change details are refreshed
- **WHEN** the user refreshes a selected change
- **THEN** the system obtains a new bounded snapshot for that change and reports its snapshot time and freshness without forcing unrelated projects to reload

#### Scenario: OpenSpec output is incompatible
- **WHEN** the installed OpenSpec CLI returns an unsupported or malformed structured result
- **THEN** the system reports the details as unavailable with a diagnostic recovery action and does not fabricate tasks from unrelated files

### Requirement: Preserve OpenSpec as the completion source of truth
The system MUST derive task completion from OpenSpec and MUST NOT use a database copy, card position, assistant prose or elapsed time as an alternative completion authority.

#### Scenario: OpenSpec marks a task complete
- **WHEN** the selected change reports a task as complete
- **THEN** the board places the task in the completed state regardless of a stale earlier Runtime snapshot

#### Scenario: A task has no execution evidence
- **WHEN** an OpenSpec task is incomplete and no fresh trusted Runtime evidence is associated with it
- **THEN** the board displays it as pending and does not infer that it is in progress, under review or blocked

### Requirement: Enrich tasks with trusted execution states
The system SHALL combine incomplete OpenSpec tasks with fresh trusted Runtime evidence to expose in-progress, review and blocked states while retaining the evidence source and freshness.

#### Scenario: Runtime identifies the current task
- **WHEN** fresh Runtime evidence binds an active session and phase to an incomplete OpenSpec task
- **THEN** the board displays that task as in progress or under review according to the explicit Runtime phase

#### Scenario: Runtime reports a blocking condition
- **WHEN** fresh Runtime evidence explicitly records a pause, conflict, context drift, failed verification or pending user decision for an incomplete task
- **THEN** the board displays the task as blocked or needing attention and shows a sanitized reason and recovery action

#### Scenario: Runtime evidence is stale
- **WHEN** execution evidence is older than its accepted freshness boundary or no longer matches the project and change fingerprint
- **THEN** the board does not present it as a current execution state and clearly marks the affected projection as stale or needing refresh

### Requirement: Provide project and change board views
The system SHALL provide a project overview of change cards and a selected-change view of task cards organized for rapid scanning and inspection.

#### Scenario: User views a project overview
- **WHEN** the user selects a project without selecting a change
- **THEN** the system displays each active change as a selectable card with title, stable change identifier, progress, status and last activity information

#### Scenario: User views a change task board
- **WHEN** the user enters a change
- **THEN** the system groups its tasks by supported board state and allows the user to inspect task details and related artifacts

#### Scenario: User searches and filters
- **WHEN** the user enters a query or selects project, change or state filters
- **THEN** the board shows matching entities while preserving a clear way to reset filters

#### Scenario: User uses a narrow screen
- **WHEN** the available viewport cannot present the desktop columns accessibly
- **THEN** the system provides a project selector, state filter and single-column task disclosure without requiring horizontal five-column navigation

### Requirement: Keep the initial board read-only
The initial task board SHALL NOT directly mutate task completion, task order, change archive state or Runtime disposition.

#### Scenario: User inspects a task
- **WHEN** the user selects a task card
- **THEN** the system offers only safe navigation, artifact inspection, refresh and entry into an existing authorized development session

#### Scenario: No write evidence exists
- **WHEN** a task appears ready for completion but implementation or verification evidence has not been accepted
- **THEN** the board does not expose an action that directly marks the task complete

### Requirement: Provide recoverable board states
The system SHALL render loading, empty, stale, unavailable and error states in the context of the current project or change and SHALL provide an applicable recovery path.

#### Scenario: Project has no active changes
- **WHEN** an OpenSpec-enabled project has no active changes
- **THEN** the system explains that no active requirements were found and provides navigation to another project or a refresh action

#### Scenario: Cached data becomes stale
- **WHEN** cached board data is shown beyond its freshness boundary
- **THEN** the system labels the snapshot as stale, preserves readable data, and offers refresh instead of replacing the workspace with a dead-end error

#### Scenario: OpenSpec CLI is unavailable
- **WHEN** the server cannot start the OpenSpec CLI
- **THEN** the system explains that OpenSpec tooling is unavailable and provides the platform-supported environment recovery path
