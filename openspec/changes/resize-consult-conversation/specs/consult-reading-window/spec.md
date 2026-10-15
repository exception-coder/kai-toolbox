## ADDED Requirements

### Requirement: Adjustable consultation reading window
The active conversation and archived consultation SHALL support desktop edge resizing and expansion within the current work area.

#### Scenario: Resize and restore
- **WHEN** the user drags a window edge or uses its keyboard separator
- **THEN** the window width changes within the available work area
- **AND** expansion followed by restoration retains the adjusted width and existing input content

#### Scenario: Narrow work area
- **WHEN** the work area shrinks or becomes a mobile viewport
- **THEN** the window stays within the available space without page overflow
- **AND** mobile users receive full available width without redundant resizing controls

### Requirement: Readable wide consultation tables
Consultation answers SHALL retain complete table content with readable columns and local horizontal scrolling when necessary.

#### Scenario: Many columns
- **WHEN** a table is wider than the conversation window
- **THEN** the table can scroll horizontally without expanding the message or page beyond the window
- **AND** the table remains keyboard reachable with its native semantics

#### Scenario: Content changes or loading
- **WHEN** Markdown content renders asynchronously or an archived answer is replaced
- **THEN** tables remain keyboard reachable and content, headings and links remain intact

#### Scenario: Layout-only action
- **WHEN** the user adjusts or expands a consultation window
- **THEN** no message, archive, model invocation or session switch is triggered
