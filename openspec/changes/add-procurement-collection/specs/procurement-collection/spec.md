# 招采信息采集

## ADDED Requirements

### Requirement: Seed provenance and persistent management

The system SHALL import the supplied site, notice and rule data once and preserve subsequent edits.

#### Scenario: Restart after editing a keyword
- **WHEN** a user edits or disables a seeded rule and the application restarts
- **THEN** the edit remains and historical Excel evidence is not labelled as live capture

### Requirement: Bounded observable collection

The system SHALL collect registered public URLs with iframe support, bounded timeouts, host validation, deduplication and per-notice failure reporting.

#### Scenario: Source returns an error
- **WHEN** a source returns HTTP 502 or no usable article
- **THEN** its capture is marked failed with a retry action, without fabricating content or erasing previous evidence

#### Scenario: Collection run survives restart
- **WHEN** the process restarts during a run
- **THEN** the run is marked interrupted and can be retried

### Requirement: Hybrid evidence parsing

The system SHALL use deterministic code for lexical and numerical candidates and a shared LLM gateway for contextual interpretation using enabled rule snapshots.

#### Scenario: Length belongs to a river
- **WHEN** an article mentions pipe length and a separate river treatment length
- **THEN** numerical candidates retain context and river length is not automatically added to pipe totals

#### Scenario: Model unavailable or ungrounded
- **WHEN** the model fails or returns unsupported evidence or dictionary codes
- **THEN** raw text and code candidates remain available with manual review status

### Requirement: Workspace layout and recovery

The system SHALL expose overview, results, sites and rule management in a left workspace navigation and a right content area with responsive reflow.

#### Scenario: User manages rules
- **WHEN** a user creates, edits, disables or deletes a keyword, negative rule, cooccurrence rule or dictionary entry
- **THEN** the persisted change is visible after reload and applied to subsequent parsing

#### Scenario: Empty or unavailable results
- **WHEN** a filter has no results or a request fails
- **THEN** the page retains navigation and offers clear-filter or retry actions
### Requirement: Configurable sales judgment structure
The system SHALL initialize all 47 named columns of the supplied sales judgment candidate worksheet as an editable, versioned structure, separate from historical sample values.

#### Scenario: Maintaining fields
- **WHEN** a user updates a field label, group, description, order or enabled state with the current version
- **THEN** the system saves a new structure version and retains a historical snapshot; stable keys and existing types cannot be changed

#### Scenario: Parsing a notice
- **WHEN** intelligent parsing runs
- **THEN** the system uses a snapshot of enabled LLM fields, validates evidence and types, normalizes explicit monetary units to ten-thousand yuan, and leaves unsupported sales recommendations empty

#### Scenario: Correcting values
- **WHEN** a user saves typed manual corrections with current structure and record versions
- **THEN** the corrections persist separately, survive subsequent collection and parsing, and may be reset to automatic values

#### Scenario: Concurrent changes
- **WHEN** a stale structure or notice correction is submitted
- **THEN** the system rejects the stale write and requires reloading current data

### Requirement: Daily national-platform link discovery

The system SHALL discover today's notice links in Asia/Shanghai through Patchright list-page controls before collecting detail pages or invoking a model.

#### Scenario: Traversing sources and provinces
- **WHEN** a daily discovery starts
- **THEN** all six data sources are queried, province-capable sources traverse the five specified provinces, and other sources retain unlocated rows separately without assuming a province

#### Scenario: Complete pagination
- **WHEN** a query returns multiple pages
- **THEN** each page is saved until the last page is confirmed; timeout, repeated pages, cross-date records or safety limits result in an explicit incomplete status

#### Scenario: Independent downstream stages
- **WHEN** the user starts details or parsing for a discovery batch
- **THEN** only that batch's matched province notices are processed, preserving duplicate notices and manual corrections

### Requirement: Cached business extraction
The system SHALL cache captured detail HTML and frames, reuse successful local content, and present discovered notices by collection site with enabled business columns.

#### Scenario: Repeated extraction
- **WHEN** a user requests extraction for a captured notice
- **THEN** the system reads its local content without visiting the remote detail URL and preserves human corrections

#### Scenario: Code and Codex extraction
- **WHEN** deterministic labels identify unambiguous business values
- **THEN** code persists those values and Codex receives only unresolved fields, with validated evidence and recoverable failures

#### Scenario: Historical results
- **WHEN** the user opens current collection results
- **THEN** only notices registered from discovered links appear, while historical cached data remains preserved

### Requirement: Field validation and targeted retry
The system SHALL preserve valid business fields independently and record parser diagnostics separately from business values and labeled evaluation results.

#### Scenario: A returned field fails validation
- **WHEN** an amount or evidence fails validation while other fields are valid
- **THEN** valid fields remain available, the rejected field has a reason, and at most one corrective model call receives unresolved fields and validation feedback

#### Scenario: Explicit unit in a label
- **WHEN** an amount has an explicit unit in its own label
- **THEN** code normalizes that amount using its original evidence without inferring units from unrelated text

### Requirement: Parser experience registry
The system SHALL display implemented parsing experiences with positive and negative examples separately from industry keywords and business results.

#### Scenario: Manual example regression
- **WHEN** the user runs registered field examples
- **THEN** current production validation rules run against those examples, persist expected and actual outcomes, and do not call a model or alter notices


### Requirement: Export filtered business results as Excel
The system SHALL export all matching business records as XLSX using enabled business columns and manual corrections.

#### Scenario: Export spans multiple pages
- **WHEN** the user exports results with search, site and capture-status filters
- **THEN** the workbook includes every matching row across pages, retains empty values, and writes text as strings rather than formulas
### Requirement: Purpose grouped parsing rules
The system SHALL manage shared terms, interpretation and exceptions by purpose while retaining original rule provenance.

#### Scenario: Parse only unresolved business fields
- **WHEN** a parsing round has a set of unresolved fields
- **THEN** only enabled purpose groups relevant to those fields and their applicable dictionaries are included, and used rule IDs are recorded

#### Scenario: Edit a merged group
- **WHEN** the user saves a merged rule group
- **THEN** the next run uses the saved group and the original source entries remain available for inspection
