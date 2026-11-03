## ADDED Requirements

### Requirement: Inline prepared page previews
Chat SHALL recognize complete same-origin Forge preview entries in rendered messages, group duplicate and alternate device links into one preview block per Markdown text segment, and reuse the existing authenticated page preview service. Ordinary external URLs, code examples, incomplete links and document-nested references SHALL NOT trigger automatic browser creation.

#### Scenario: Read a reply containing phone and desktop previews
- **WHEN** the reply enters the reading viewport
- **THEN** one selected preview opens inline with its route, device, resource and source context intact, and alternate links remain selectable
- **AND** appending streamed text does not recreate the existing preview or reset the chat draft

### Requirement: Preserve preview lifecycle and conversation context
The inline host SHALL pause screenshot/status polling when hidden, use the same preview ID for expansion, and close only contexts it created when replaced or unmounted. It SHALL NOT switch chat sessions, send messages or cancel tasks.

#### Scenario: Expand and return
- **WHEN** the user clicks an embedded preview link or its full-screen button and later closes the dialog
- **THEN** the same browser context remains inline, focus returns to the initiating control and the chat remains in place

#### Scenario: Change sessions during creation
- **WHEN** an owned browser is returned after the message has unmounted
- **THEN** it is closed without updating the new session; a borrowed preview ID is not closed by message unmount

### Requirement: Retain resource and environment boundaries
Inline previews SHALL retain existing resource verification, permissions, production confirmation and explicit takeover controls. They SHALL use real service states and show recoverable errors, without automatic retry loops or recursive creation inside a Forge preview-render tab.

#### Scenario: Production or unresolved resource
- **WHEN** the referenced account is PROD, missing or not yet verified
- **THEN** no automatic browser starts and the existing confirmation or resource recovery remains visible

#### Scenario: Error and recursive rendering
- **WHEN** creation fails or the Forge page is itself being previewed
- **THEN** the error can be retried explicitly using the existing operation identity, and nested automatic previews remain disabled
