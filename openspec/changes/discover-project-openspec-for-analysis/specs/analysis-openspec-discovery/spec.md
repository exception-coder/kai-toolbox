## ADDED Requirements

### Requirement: Project-scoped plan discovery
Code analysis SHALL discover standard OpenSpec changes from the requirement's resolved project and exclude archived changes, missing task plans and paths escaping that project.

#### Scenario: Unique candidate
- **WHEN** exactly one eligible change exists
- **THEN** it is selected automatically and displayed to the user

#### Scenario: Multiple candidates
- **WHEN** several eligible changes exist
- **THEN** the UI requires an explicit choice and does not guess by recency

#### Scenario: No candidates or discovery error
- **WHEN** the project has no task plans or cannot be read
- **THEN** the UI explains the condition and provides refresh; a read failure is not presented as an empty directory

### Requirement: Plan binding is not implementation evidence
Analysis SHALL revalidate the selected plan and preserve existing code-evidence verification.

#### Scenario: Selected change removed
- **WHEN** the selected change is no longer readable
- **THEN** it is not silently replaced with another change

#### Scenario: Insufficient implementation evidence
- **WHEN** tasks exist but verified code evidence is insufficient
- **THEN** the analysis does not claim implementation completion
