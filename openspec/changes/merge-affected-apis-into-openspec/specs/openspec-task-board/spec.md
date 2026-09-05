## ADDED Requirements

### Requirement: Present affected APIs as OpenSpec change evidence
The system SHALL present registered server HTTP interface changes and their verification evidence inside the owning OpenSpec change detail instead of exposing them as an independent Vibe Coding workspace.

#### Scenario: Bound change has affected API evidence
- **WHEN** one or more supervised sessions for the selected project and OpenSpec change registered affected HTTP interfaces after their current supervision run started
- **THEN** the change detail displays each interface method, path, change type, source location, description, verification status, verification method, verification summary, associated session, and last update time

#### Scenario: Affected API registration is not verified
- **WHEN** an interface was registered without successful verification evidence
- **THEN** the change detail labels it as unverified and does not present registration as a passed release check

#### Scenario: Change has no attributable interface evidence
- **WHEN** no interface record can be safely associated with the selected project, change, and supervision time boundary
- **THEN** the change detail displays an explanatory empty state and does not infer interfaces from assistant prose or unrelated sessions

### Requirement: Scope affected API evidence to the bound change
The system MUST associate interface evidence only through a trusted session supervision binding whose normalized project root and OpenSpec change match the selected change.

#### Scenario: Same session was rebound to another change
- **WHEN** a session contains interface records older than the current supervision run for the selected change
- **THEN** those older records are excluded from the selected change detail

#### Scenario: Multiple sessions register the same interface
- **WHEN** multiple matching supervised sessions registered the same HTTP method and path
- **THEN** the change detail contains one entry using the most recently updated evidence

#### Scenario: Runtime evidence does not match project identity
- **WHEN** a supervision run references the change identifier but its bound project root does not match the selected project
- **THEN** its interface records are excluded from the change detail

### Requirement: Keep affected API collection as internal evidence
The system SHALL retain the existing Forge affected API registration capability and session-scoped compatibility endpoints while removing the independent Vibe Coding navigation and polling surface.

#### Scenario: Agent registers an affected interface
- **WHEN** an Agent uses the Forge affected API registration capability during an OpenSpec-bound implementation
- **THEN** the system stores the evidence through the existing session contract and makes attributable evidence available in the OpenSpec change detail

#### Scenario: User opens a Vibe Coding session
- **WHEN** affected API records exist for that session
- **THEN** the chat navigation does not show a standalone affected-interface tab and does not poll solely to maintain that removed navigation item
