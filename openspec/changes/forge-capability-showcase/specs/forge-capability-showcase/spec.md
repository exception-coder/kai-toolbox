## ADDED Requirements

### Requirement: Public product introduction
The system SHALL register 探索 Forge at `/explore` through the frontend manifest and render product content without backend responses, featuring 彩虹胶囊 and 委托 with more emphasis than supporting capabilities.

#### Scenario: First visit without backend
- **WHEN** a visitor opens `/explore` while API requests are unavailable
- **THEN** the introduction, featured capabilities and explorer remain readable and interactive

### Requirement: Category exploration
The system SHALL offer all capabilities and category filters, deriving the visible count from the displayed editorial catalog.

#### Scenario: Filter and reset
- **WHEN** a visitor selects a category and then 全部
- **THEN** matching capabilities appear first and the complete catalog is restored on reset

### Requirement: Understand before using
The system SHALL open a detail drawer with value, suitable scenarios, workflow and an existing destination before entering a tool. It SHALL explain additional entry steps and SHALL NOT create tasks from the showcase.

#### Scenario: Delegation entry
- **WHEN** a visitor opens 委托 details
- **THEN** the drawer explains choosing a Vibe Coding session and opening 委托, with a link to the actual Vibe Coding route

### Requirement: Accessible responsive presentation
The system SHALL support mobile reflow, light and dark themes, labeled dialogs, keyboard navigation, Escape closing and focus return to the triggering capability.

#### Scenario: Keyboard dismissal
- **WHEN** a visitor opens a capability with the keyboard then presses Escape
- **THEN** the drawer closes and focus returns to the initiating control

#### Scenario: Mobile reading
- **WHEN** the viewport is 375 pixels wide
- **THEN** featured blocks reflow vertically and the page and drawer have no horizontal overflow

### Requirement: Delegation capability manual
The system SHALL also expose `/explore/vibe-coding` as the parent capability explanation for OpenSpec supervision and constrained delegation, with source-grounded diagrams and cross-links.

#### Scenario: Understand supervised development
- **WHEN** a visitor opens the Vibe Coding manual
- **THEN** it explains the server continuation loop, execution phases, human handoff, permission enforcement and evidence limitations separately from SDK onboarding

#### Scenario: Understand binding implementation
- **WHEN** a visitor reads the binding section
- **THEN** diagrams trace the controller, persisted execution context, internal queue and session-bound MCP report, distinguishing deterministic checks from prompt guidance and file sandboxing

#### Scenario: Understand document-driven execution
- **WHEN** a visitor reads how OpenSpec guides the model
- **THEN** the manual distinguishes proposal, specs, design and tasks, traces CLI snapshots and Agent document reading through execution feedback, and explains why task checkboxes and structural validation do not prove implementation correctness

#### Scenario: Discover session capabilities
- **WHEN** a visitor opens the session capability catalog
- **THEN** a visual overview and expandable descriptions explain the four Forge tools, optional business database/application tools, workspace capabilities, activation conditions and implementation entry points
- **AND** comparison with direct Codex use distinguishes Forge-specific integrations from native model, Skills and MCP capabilities without claiming exclusivity

The system SHALL expose a public manual at `/explore/delegation`, linked from delegation details. It SHALL explain designated participant access to an existing session, owner/server/client/Agent responsibilities, real protocol flows, quick integration and recovery limits.

#### Scenario: Spring Boot relay integration
- **WHEN** a visitor selects Spring Boot Starter in quick start
- **THEN** the manual shows the business-server relay diagram, actual Maven dependency and both server configurations, required identity mapping, server-only token storage and a same-origin `/pair` plus SDK example without exposing Forge credentials in browser code

#### Scenario: Read implementation principles
- **WHEN** a visitor opens the manual and selects a workflow scenario
- **THEN** a labeled diagram explains the participating actors and message direction, including owner-only risky approvals

#### Scenario: Integrate a client
- **WHEN** a visitor selects SDK integration
- **THEN** the manual shows actual build/install instructions, authentication prerequisites and a copyable typechecked example using the public SDK, without executing that example

#### Scenario: Clipboard unavailable
- **WHEN** copying a code example fails
- **THEN** the code remains selectable and the page explains how to copy manually
