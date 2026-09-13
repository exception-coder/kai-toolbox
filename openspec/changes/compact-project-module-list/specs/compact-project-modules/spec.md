## ADDED Requirements

### Requirement: Compact module browsing
The workspace SHALL render compact module rows with names and inspectable full paths, and SHALL preserve open-session and pin operations without repeated knowledge or unopened badges.

#### Scenario: Frontend directory list
- **WHEN** all listed modules are under frontend/src/features
- **THEN** the list is identified as frontend function modules rather than a complete backend or business-domain inventory

#### Scenario: More than twelve modules
- **WHEN** an unfiltered list contains more than twelve top-level modules
- **THEN** twelve are initially shown with a remaining-count expansion action and can be collapsed again

#### Scenario: Search results
- **WHEN** a module search is active
- **THEN** all matching modules are shown without the twelve-item limit

### Requirement: Preserve module actions and hierarchy
The list SHALL retain existing session routing, pinning, pending state and nested module access with accessible controls.

#### Scenario: Existing session and pending open
- **WHEN** a module has a session or is opening
- **THEN** its action indicates the existing session or is disabled while opening respectively

#### Scenario: Nested modules
- **WHEN** a module has children
- **THEN** a child count and expansion control exposes descendants with independent open and pin actions

#### Scenario: Narrow viewport
- **WHEN** the viewport is 375 pixels wide
- **THEN** modules use one column and names, paths and controls fit without page overflow
