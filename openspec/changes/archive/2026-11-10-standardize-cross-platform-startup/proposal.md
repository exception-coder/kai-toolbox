## Why

Windows and macOS supervisors duplicate thousands of lines of process orchestration. Standard development commands and optional containers should have one cross-platform definition without replacing Forge-specific restart/update protocols with another custom daemon.

## What Changes

- Add a Task v3 entry point for checks, preparation, foreground development, packaging and optional Compose dependencies.
- Add opt-in Phoenix Compose configuration with loopback ports and persistent data.
- Retain existing supervised launchers explicitly for restart/update compatibility; do not stop running services or migrate credentials automatically.

## Capabilities

### New Capabilities
- `portable-startup`: Standard cross-platform development and dependency commands with explicit lifecycle ownership.

### Modified Capabilities

None.

## Impact

Taskfile.yml, deploy/local-dependencies, startup documentation and contract tests. Task v3 is a new optional developer tool; Docker is optional. No backend or runtime ownership changes. Linux/macOS runtime certification remains environment-dependent.
