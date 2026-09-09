## Why

Code analysis requires users to type an OpenSpec change ID although its project already has a standard changes directory. Missing binding downgrades the plan context and obscures the distinction between missing plans and missing implementation evidence.

## What Changes

- Discover readable, non-archived changes under the requirement's resolved local project.
- Automatically select a sole candidate and offer a selector when several exist, with refresh and clear empty/error states.
- Revalidate the selected change during analysis and preserve the code-evidence verification barrier.

## Capabilities

### New Capabilities

- `analysis-openspec-discovery`: Project-scoped discovery and selection of existing task plans.

### Modified Capabilities

None.

## Impact

PRD progress context resolver, session-scoped read API and code-analysis UI. Reuse LocalProjectResolver and the current revision-source resolution. No new storage, schema, CLI installation or cross-module private dependency. Existing workspace-wide board cannot resolve the requirement revision project and is intentionally not queried across all projects.
