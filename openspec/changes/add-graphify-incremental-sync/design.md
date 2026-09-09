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
- FULL uses the same staged updater but starts without graph/manifest, using existing AST cache as an optimization. SYNC requires an existing valid graph and manifest. Community assignments/semantic nodes on unchanged sources are retained; new/changed structure is not claimed to have fresh semantic/community analysis.

## Risks / Trade-offs

Graphify's bridge entry point is internal and version-sensitive, so require a known package version and inspect its signature. Bound input files, graph size, cache copying, changed scope and process duration. Source mutation during extraction and changed external graph outputs abort publication. The filesystem is not a multi-file transactional database: a crash during publication cannot claim a matching new receipt. Large first-time baselines can still be costly and fail with actionable limits; never label full extraction as incremental.

## Verification

Run real Graphify fixture tests for first build, no-op, edit/add/delete/rename, unchanged nodes, affected cross-file relations and extraction scope; test malformed baseline and preservation on failure. Java tests cover SYNC orchestration, failed-profile preservation and staged publication. Build frontend/backend, execute Forge quality gate, register changed init API behavior with evidence. Do not use the user's 58 MB graph as the first experiment.
