## Why

Registry SYNC currently rechecks evidence without updating stale code graphs. Installed Graphify 0.9.16 exposes content-based incremental detection and a changed-path rebuild that preserves existing graph content. Its extract --no-cluster incremental branch can write only the changed extraction; Forge must use the preserving update path instead.

## What Changes

- SYNC updates existing structural graphs through Graphify change detection, AST cache and changed-path reconciliation.
- Include directly related source files to refresh affected cross-file relationships; handle additions, modifications, deletions and renames.
- Stage graph updates, validate source stability and graph consistency, then publish; retain original graph/profile on failure.
- Show actual changed/reused/deleted/affected counts and no-change outcomes; distinguish structural freshness from semantic/community reanalysis.
- Reuse the safe updater for FULL structural builds instead of the existing raw-extract path.

## Capabilities

### New Capabilities
- `graphify-incremental-sync`: safe structural graph synchronization.

### Modified Capabilities

None.

## Impact

tool-projects registry evidence port, local Graphify adapter/bridge, initialization orchestration and project registry copy. Existing POST /api/project-registry/{id}/init mode SYNC gains graph update behavior. No SQL changes or automatic Git hooks/watchers.
