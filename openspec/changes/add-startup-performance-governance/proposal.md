## Why

AI-assisted iteration currently mixes Maven execution, JVM launch, Spring initialization and tool readiness into one wait. An independent performance governance module must provide attributable evidence before optimization.

## What Changes

- Integrate build attribution into the existing supervised launch and automatically display it in the running-process page, without requiring a separate measurement command.

- Add `toolbox-performance`, owning bounded startup telemetry and read-only diagnostics.
- Add a menu-registered page for milestones, slow steps, explicit tool coverage and JSON export.
- Instrument application entry and Spring startup steps; distinguish context refresh, readiness and first successful synchronous API request.
- Add a measured launch script that reports Maven build separately from JVM/runtime readiness and preserves failed build reports.
- Expose explicit background-tool readiness observations without claiming uninstrumented tools are ready.
- Keep telemetry passive, bounded and free of request bodies, query strings and credentials.
- Non-goals: framework migration, automatic optimization, global lazy initialization and changes to existing restart lifecycle.

## Capabilities

### New Capabilities

- `startup-performance-governance`: correlated startup stages, bounded Spring steps, explicit missing evidence and repeatable measured launch reports.

### Modified Capabilities

None.

## Impact

Root and starter POMs, ToolboxApplication, a new platform Maven module, the supervisor's internal backend command wrapper, an optional PowerShell measurement launcher and the requested visual page. Existing supervisor lifecycle remains intact. Sources: current startup source, Graphify navigation supplemented by current source because graph paths include older script locations, and Spring Boot 3.4 official startup APIs. No database migration or unresolved business decision.
