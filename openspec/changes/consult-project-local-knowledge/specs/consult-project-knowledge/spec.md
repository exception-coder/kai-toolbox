## ADDED Requirements

### Requirement: Project-owned consultation knowledge
The system SHALL read knowledge from the authorized project files without depending on the retired public repository.

#### Scenario: Fresh files without central service
- **WHEN** a consultation reads its project knowledge and the public repository is absent
- **THEN** it returns project-relative citations and reads changed file content on the next call
- **AND** missing knowledge is explicit and does not fall back to another project

#### Scenario: Scope enforcement
- **WHEN** a request selects an unauthorized project or a path outside its root
- **THEN** no file content outside the authorized root is returned

### Requirement: Retired dependency isolation
The system SHALL keep cross-topology independent and SHALL NOT reinstall Domain Knowledge during plugin updates.

#### Scenario: Updating team tools
- **WHEN** a user runs the existing team update action
- **THEN** cross-project-topology supplies its own server and the retired repository is not synchronized or registered

#### Scenario: Retired administration status entry
- **WHEN** a client queries the legacy Domain Knowledge status endpoint
- **THEN** the response is HTTP 410 with project-document guidance and no old engine starts
- **AND** topology status uses its independent engine without inherited project knowledge

### Requirement: DDL source provenance
The system SHALL distinguish project SQL evidence from historical knowledge snapshots.

#### Scenario: Only migrated Markdown available
- **WHEN** target table structure exists only in historical knowledge or inherited configuration
- **THEN** the result reports missing current DDL evidence instead of verified structure
