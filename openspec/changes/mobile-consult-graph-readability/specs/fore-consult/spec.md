## ADDED Requirements

### Requirement: Mobile graph adapts to its visible workspace
The consultation graph SHALL use the existing visible systems and topology on phones, fit the complete network with safe margins before manual interaction, and retain the existing desktop presentation.

#### Scenario: Phone graph is first opened
- **WHEN** the phone graph tab becomes visible with configured systems
- **THEN** the graph centers the nodes and labels within the measured canvas, with consistent node dimensions and no persistent relationship labels

#### Scenario: User inspects a system
- **WHEN** the user selects a node
- **THEN** its direct relationships and neighbors are highlighted and relationship directions and types appear in a closeable bottom detail region
- **AND** closing details restores node focus without resetting the viewport

#### Scenario: User manually explores the graph
- **WHEN** the user pans or zooms
- **THEN** the chosen viewport persists during further selection and tab switching
- **AND** the full-graph action restores automatic fitting

#### Scenario: User asks about a selected system
- **WHEN** the user activates the selected system's consultation action
- **THEN** the existing consultation composer opens a new draft with that system as the preferred source context
- **AND** the original consultation is retained and no message is sent automatically
