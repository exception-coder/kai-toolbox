## ADDED Requirements

### Requirement: Focused code analysis presentation
The dialog SHALL show the requirement, current score and remaining effort before optional evidence and settings, with readable text and a stable action footer.

#### Scenario: Existing analysis
- **WHEN** an analysis result exists
- **THEN** the score and remaining effort are visible and detailed evidence can be expanded without starting analysis

#### Scenario: Empty or stale result
- **WHEN** no analysis exists or its evidence is stale
- **THEN** the dialog states the limitation and retains the appropriate analysis action

### Requirement: Accessible recoverable actions
The dialog SHALL contain keyboard focus, close on Escape, retain existing permission checks and prevent duplicate submissions while starting or running analysis.

#### Scenario: Background analysis
- **WHEN** analysis is being submitted or running
- **THEN** its start action is disabled and the dialog can still be closed without cancelling the background work

#### Scenario: Failure
- **WHEN** the analysis request fails
- **THEN** the error is visible and the user can retry with preserved settings
