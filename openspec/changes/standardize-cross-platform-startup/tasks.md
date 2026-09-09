## 1. Standard entry
- [x] 1.1 Add shared Task commands and explicit legacy compatibility entry points.
- [x] 1.2 Add optional Phoenix Compose with safe persistent storage and explicit image selection.
- [x] 1.3 Document startup paths, configuration and service ownership in the README and startup guide.

## 2. Verification
- [x] 2.1 Verify Task command graph and fixture execution without starting live services; validate Compose positive/negative configurations.
- [x] 2.2 Run OpenSpec and available Forge quality checks, record actual platform limits.

## Evidence

- Official Task 3.53.1 Windows binary downloaded into local QA directory and checked against release SHA-256 checksums. Task list and dry-run build/preparation/dev/run/legacy commands succeeded.
- Three Node contract tests passed: native command dispatch with paths containing spaces and inherited conflicting environment settings; missing JAR fails before Java; Compose missing image fails while configured image binds loopback with persistent storage. No images pulled or live services started/stopped.
- Forge CLI exit 0, JSON PASSED; executedCheckers empty, API-RUNTIME-001 executed against existing service scenarios. This does not test the new startup runtime.
- macOS/Linux actual startup, Ctrl+C process-tree cleanup and full project build are not certified by these fixture tests. Existing supervisors remain supported; retirement is not part of this change. Keep change active pending platform acceptance.
