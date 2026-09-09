## Why

Expanding the knowledge panel immediately starts filesystem-backed status detection, with no request deadline or cancellation passed from React Query. The user reports the page becoming unresponsive. The screenshot proves a status-panel expansion, not a 3D visualization. Browser-level reproduction is still awaiting permission; do not claim the entire reported freeze is proven.

## What Changes

- Separate expanding cached status from explicitly checking live status.
- Give live status requests cancellation and a finite deadline, with retry actions.
- Show current Graphify evidence independently of the two collapsed business sections.
- Add regression coverage for request scope and usable collapse/retry while requests are pending.

## Capabilities

### New Capabilities
- `knowledge-panel-responsiveness`: bounded, explicitly triggered status checks.

### Modified Capabilities

None.

## Impact

Frontend knowledge-graph API wrappers and the project workspace knowledge panel only. No server HTTP contract, SQL or initialization behavior changes.
