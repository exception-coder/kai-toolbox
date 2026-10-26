## ADDED Requirements

### Requirement: Preview registered applications from the composer
Vibe Coding SHALL expose site preview from the composer more-actions menu on desktop and mobile. The action SHALL open the existing preview dialog within the current conversation and SHALL NOT navigate or send a chat message.

#### Scenario: Choose an application before starting
- **WHEN** a user opens site preview from the composer
- **THEN** the registered application and environment selector SHALL be displayed before creating any browser
- **AND** choosing an application SHALL initialize its target path from the registered address
- **AND** explicit submission SHALL use the selected resource ID and device without including credentials

#### Scenario: Return to the conversation
- **WHEN** the dialog closes
- **THEN** focus SHALL return to the composer more-actions trigger and the draft and conversation SHALL remain intact
- **AND** switching sessions SHALL dispose the old dialog through the existing preview lifecycle

#### Scenario: No eligible application
- **WHEN** no application with an eligible runtime account is available or the list fails to load
- **THEN** the user SHALL be able to configure or refresh resources and close the dialog without a dead end
