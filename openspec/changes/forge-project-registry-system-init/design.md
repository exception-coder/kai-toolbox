## Context

`ProjectWorkspacePage.tsx` currently owns module browsing, aggregation and launch. `OnboardService.java` only mirrors external files. `GraphifyProjectStatusServiceImpl.java` uses directory mtime and cannot prove working-tree coverage. The registry belongs to `tool-projects`; existing modules remain accessible through a secondary route.

## Goals / Non-Goals

Deliver registered identities, resumable initialization, five evidence assets and system-bound tasks. Do not rewrite Graphify, clone repositories, install global tools, run discovered build commands, infer verified DDL, or automatically approve semantic domains. Automatic incremental graph rebuild and domain generation remain phase two.

## Decisions

- Persist `forge_project`, `forge_system_init_run`, `forge_system_profile` and `forge_system_task` (binding to the existing requirement pool, not a second task engine). Use SQLite transactions for claim/publication and task registration/binding. Registry ID is stable, canonical local path unique, metadata updates invalidate readiness. No deletes or historical task migration.
- Application services depend on domain storage contracts; JDBC and filesystem/process adapters stay in infrastructure. `RequirementRegistrationPort` reuses the existing task registration flow. Frontend imports claude-chat only through its public API.
- Full Init stages: repository, environment, graphify, semantic, mapping, verification, profile. Use installed Graphify `extract --code-only --no-cluster` when no graph exists; reuse valid existing evidence on repeat initialization. Graph content remains Graphify-owned. Missing executable, unsupported capability or missing evidence yields a recoverable gap. Semantic registry is an evidence navigation asset until phase two.
- Preserve existing AGENTS/CLAUDE/OpenSpec files. Discover execution and verification commands from repository manifests; discovered commands are not executed. Do not read credential files. Count Graphify nodes from actual JSON, never fabricate API/table/domain statistics.
- State precedence: active run INITIALIZING, failed run FAILED, no profile UNINITIALIZED, fingerprint drift SYNC_REQUIRED, evidence gaps DEGRADED, otherwise AI_READY. Profile records source fingerprint and immutable version. Publish only after all stages finish; failure retains prior profile. Startup marks interrupted runs failed. Same-project claim prevents duplicate runs.
- Manual Sync rechecks evidence and publishes a new profile without pretending to run incremental graph reconciliation. Full Init and Sync are explicit, bounded background jobs; source changes during a run prevent an AI_READY outcome.
- Readiness requires usable graph with covered source state, nonempty execution rules, configured OpenSpec behavior, and discovered verification commands. Semantic and data mappings explicitly distinguish partial/not configured evidence from verified facts.
- Tasks require a registered system, allow optional domain/context, and bind to the profile version at creation. Existing `RequirementRegistrationPort` creates the real task. Agent handoff contains system ID, root, source version, asset references, gaps and task description; no module selection is required.
- UI uses global registry core plus repository quiet-luxury direction, conservative primitives and a bounded exploration of registry rows/detail tabs. Use existing semantic tokens, left alignment, restrained status labels, responsive rows, inline recovery and real API data.

## Risks / Trade-offs

- DDL 未核验: Forge returned PARTIAL; four proposed tables absent from the baseline. These are new SQLite tables with no existing-data assumptions. Validate schema and repository transactions using real SQLite tests.
- Graph CLI varies by installation: inspect supported command output and isolate execution with timeout, bounded output and explicit arguments. No user shell snippets.
- Large repositories: bound scanned files, file sizes and process time. Report incomplete evidence; never claim complete counts from truncated input.
- Local memory pressure: require at least 2 GiB free physical memory before automatic Graphify extraction and use one AST worker. Runtime sources exclude chat attachments and generated frontend bundles. Existing graph remains authoritative when extraction is unavailable or interrupted.
- Full semantic analysis is not automated in phase one; link actual sources and expose gaps. Code graph availability does not prove business truth or runtime correctness.

## Migration Plan

Add idempotent startup tables, deploy backend then frontend. Existing workspace path opens the registry; legacy module browsing remains reachable under `/tools/project-workspace/modules`. Register projects explicitly from discovered workspace directories or a local path. Rollback code leaves additive tables unused; no data removal or manual SQL required.

## Verification

Test canonical path uniqueness, metadata update, concurrent claim, restart recovery, version preservation on failure, malformed graph, fingerprint drift, bounded scans, task transaction and profile context. Run targeted Java tests, frontend tests/typecheck/build and Forge quality gate; inspect desktop/mobile registration and failure flows in browser. Register affected HTTP APIs with actual evidence status.

## Consolidated project management

The registry owns the user-facing entry for registered systems, searchable local discovery, directory settings and module workspaces. Existing workspace and legacy project scan configuration remain their compatibility storage; edit both through the registry using the existing dynamic configuration public API, without new tables or server contracts. Merge discovered directories by normalized path, retain existing project actions, and populate registration from selection. Old project-management and module URLs redirect to registry sections. Configuration writes are independent and report their own errors; never imply an atomic multi-block save. Preserve manual absolute-path registration when discovery fails. Validate discovery selection, duplicate paths, configuration list replacement and legacy routes with frontend tests and the existing quality gate.

## Open Questions

Existing graph artifacts are distinct from proven current-source coverage. Present the legacy freshness warning with this distinction and explain that full initialization invokes extraction without guaranteeing incremental work; manual sync only rechecks evidence. Apply wording at display time to existing profile gaps, asset evidence and run messages without rewriting historical records.

Registry presentation uses Chinese primary labels with English equivalents for the five assets and seven pipeline stages, keyed by stable kind/stage IDs so existing profiles need no migration. Overview includes a plain-language guide to checks, initialization outputs and purpose; it distinguishes full initialization from manual evidence synchronization and discovery from actual build/API/database verification.

No unresolved first-phase business decisions. Provider-driven semantic domain generation and change listeners are explicitly deferred.
