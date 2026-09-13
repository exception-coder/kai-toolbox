## ADDED Requirements

### Requirement: Visualize official task and planning query results

The board SHALL display official OpenSpec task completion and planning artifact status without parsing Markdown or treating planning completion as runtime acceptance.

#### Scenario: Inspect remaining and completed work

- **WHEN** instructions apply returns completed and incomplete tasks
- **THEN** the board shows completion counts and readable full task descriptions with filters for remaining and completed work

#### Scenario: Missing planning prerequisites

- **WHEN** status or instructions apply reports missing artifacts or prerequisites
- **THEN** the board displays their returned identifiers and statuses separately from runtime evidence

#### Scenario: Older server or absent optional fields

- **WHEN** planning status is absent
- **THEN** the board explicitly reports unavailable planning status instead of claiming all materials are ready

#### Scenario: Stale snapshot

- **WHEN** a query fails and a previous snapshot is returned
- **THEN** task and planning data keep the stale indication and refresh action
