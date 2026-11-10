## REMOVED Requirements

### Requirement: Present affected APIs as OpenSpec change evidence
**Reason**: The structured affected-API registry duplicates the interface contract already owned by OpenSpec artifacts.
**Migration**: Record changed interface method, path, behavior, compatibility and verification directly in the relevant OpenSpec spec/design/tasks.

### Requirement: Scope affected API evidence to the bound change
**Reason**: There is no longer a separate affected-API evidence collection to correlate with a supervised session.
**Migration**: Keep all interface scope and evidence inside the bound OpenSpec change.

### Requirement: Keep affected API collection as internal evidence
**Reason**: The Agent Tool and compatibility endpoints are being retired to remove the duplicate fact source.
**Migration**: Agents update the current OpenSpec artifacts and use normal tests and Quality Gate evidence.

## ADDED Requirements

### Requirement: OpenSpec is the interface contract source
The system SHALL use the bound OpenSpec change artifacts as the source for interface scope, behavior and verification requirements, without requiring a separate affected-API registration Tool or evidence panel.

#### Scenario: Agent changes a server interface
- **WHEN** an Agent adds, modifies or removes a server interface under an OpenSpec-bound task
- **THEN** the relevant OpenSpec artifacts describe the interface contract and verification
- **AND** completion does not depend on a separate interface registration call

#### Scenario: User inspects the change
- **WHEN** a user opens the OpenSpec change board
- **THEN** the change requirements and tasks remain available
- **AND** no separate affected API evidence section is presented
