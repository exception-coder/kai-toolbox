## ADDED Requirements

### Requirement: Recent workspace groups support disclosure

The system SHALL let users independently collapse and expand each recent-session workspace group without changing persisted session groups or project identity.

#### Scenario: Collapse a workspace group
- **WHEN** a user collapses a workspace heading
- **THEN** the group hides its session rows while retaining the workspace name and session count
- **AND** the heading exposes its collapsed state to keyboard and assistive-technology users

#### Scenario: Session list refreshes
- **WHEN** recent-session data refreshes while a workspace group is collapsed
- **THEN** the group keeps the user's disclosure choice for the same normalized directory
- **AND** another workspace group remains independently operable

#### Scenario: Current session belongs to a collapsed group
- **WHEN** the current session becomes part of a collapsed recent workspace group
- **THEN** the group expands so the current session remains visible and locatable
