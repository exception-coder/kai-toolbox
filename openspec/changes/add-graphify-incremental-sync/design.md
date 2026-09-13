## Context

Local package inspected: graphifyy 0.9.16. graphify.detect.detect_incremental(kind=ast) compares manifests; graphify.watch._rebuild_code(changed_paths=...) preserves other sources and handles deletion. The native update CLI does not accept changed paths, so a bundled Python bridge calls the installed package with capability checks. Upstream reference: https://github.com/Graphify-Labs/graphify/blob/v8/graphify/skills/codex/references/update.md . Use the configured local Python interpreter, not an executable read from project content.

## Goals / Non-Goals

Incrementally synchronize structural code evidence with explicit counts and failure recovery. No invented graph extraction/merge engine, LLM calls, semantic domain generation or automatic community relabeling. No automatic full rebuild fallback from SYNC, no new database tables, no arbitrary project shell commands.

## Decisions

- Pass a temporary GRAPHIFY_OUT to the bundled bridge, seed it with existing graph/manifest and bounded AST cache entries, and use one extraction worker. Native Graphify performs change detection and reconciliation. Disable manifest mtime fast paths in the temporary copy so hashes are checked; do not modify the live manifest to force detection.
- Expand changed structural source scope by directly adjacent source files from the existing graph, to refresh affected cross-file references. Native extraction and reconciliation still own all nodes/edges. Persist concise counts in the initialization stage message.
- Pin the supported bridge contract to the inspected Graphify release until fixture tests establish another version. Fail clearly if Python/package/capabilities are missing. No upgrade or full fallback behind the user's back.
- Hold a Forge file lock for update/publication; compare original artifact digests and bounded source fingerprints before publication to detect external changes. Write the new graph atomically and the manifest/receipt last. Roll back ordinary publication errors; a crash before the receipt remains stale rather than ready.
- Successful no-change updates leave graph bytes untouched, refresh evidence receipts and publish the next profile version. Failed updates throw through the existing run failure path and keep the old profile.
- FULL always invokes the staged updater, even when the old graph appears fresh, and starts without graph/manifest, using existing AST cache as an optimization. SYNC requires an existing valid graph and manifest. Community assignments/semantic nodes on unchanged sources are retained; new/changed structure is not claimed to have fresh semantic/community analysis.

The actual Yoooni candidate is 303,138,984 bytes. Native no-cluster extraction retains unresolved external endpoints; use Graphify export.prune_dangling_edges before validation and preserve every unresolved link under forgeCoverage.unresolvedLinks. Valid nodes/edges remain native, unresolved evidence keeps CODE and profile degraded, and unchanged unresolved evidence is retained on SYNC.

Known zero-node-source warnings are retained as structural coverage gaps in graph metadata. Current source fingerprints do not imply complete graph coverage: CODE and the graph stage remain PARTIAL, and the profile is DEGRADED. Unknown warnings, extraction failures and invalid candidates still abort publication.

## Risks / Trade-offs

Graphify's bridge entry point is internal and version-sensitive, so require a known package version and inspect its signature. Bound input files, graph size, cache copying, changed scope and process duration. Source mutation during extraction and changed external graph outputs abort publication. The filesystem is not a multi-file transactional database: a crash during publication cannot claim a matching new receipt. Large first-time baselines can still be costly and fail with actionable limits; never label full extraction as incremental.

## Verification

### Initialization recovery and portable execution

The Yoooni scan reproduces 13,003 files and two 2,987,098-byte ECharts files rejected by RegistrySourceScanner's 2 MiB limit. One is under out/artifacts. GraphifyIncrementalUpdater rejects this snapshot before starting Python. Stream fingerprints with a separate 128 MiB per-file safety bound, exclude out in both scanners, and report bounded concrete scan gaps including depth/count limits. Never mark an unreadable or over-limit source complete.

The live retry also found an existing 262,361,935-byte graph rejected by the publication baseline digest. Permit streaming baseline digests up to 1 GiB and reuse disk-backed rollback so FULL can recover an oversized old graph without loading it into heap or deleting it. Candidate parsing and publication use the inspected Graphify 0.9.16 native 512 MiB bound; metadata remains bounded separately. Java reads graph summary tokens without retaining the full node/edge tree. Successful rebuilding is still required before replacing the old graph. Real full extraction exceeded ten minutes, so FULL uses a bounded thirty-minute timeout while SYNC retains ten minutes.

Live Python stack sampling identified repeated Windows realpath calls in Graphify 0.9.16 source-key disambiguation. During a single source-stable extraction, memoize the native source-key and JavaScript source-path functions with a bounded cache and restore it on success or failure. Also cache bridge source-path normalization per run. Node/edge disambiguation remains native; regression tests compare exact results against uncached native behavior.

Keep Java orchestration and the bundled Python bridge. Resolve explicit application configuration first (fail clearly without fallback), then existing uv tool environments, a user-managed Graphify venv, and system python/python3. Probe the actual isolated interpreter for graphifyy 0.9.16 and return its absolute executable. Do not execute a project marker or shell command. Missing runtimes get a pinned uv installation recovery instruction; no silent package upgrades. uv supports managed Python on Windows, macOS and Linux: https://docs.astral.sh/uv/concepts/python-versions/ . Per-platform offline runtime bundles remain a distribution option, not a claim of a universal native binary.

Regression coverage includes large-file content changes, generated outputs, depth failures, explicit runtime failure, platform candidate layouts, and real Graphify FULL/SYNC fixtures. Build the host, run the quality gate and validate the actual restarted backend for at least 60 seconds. Ubuntu/macOS native execution must remain explicitly unverified until run on those hosts.

Run real Graphify fixture tests for first build, no-op, edit/add/delete/rename, unchanged nodes, affected cross-file relations and extraction scope; test malformed baseline and preservation on failure. Java tests cover SYNC orchestration, failed-profile preservation and staged publication. Build frontend/backend, execute Forge quality gate, register changed init API behavior with evidence. Do not use the user's 58 MB graph as the first experiment.
