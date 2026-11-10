## Why

Forge needs a product introduction that helps first-time visitors understand its value in 30 seconds. The supplied expert brief calls for a capability showcase with a clear path from understanding to using existing tools.

## What Changes

- Include the existing Spring Boot Relay Starter as a third quick-start path, with server-side identity mapping, configuration and same-origin client example.

- Add a public, locally rendered “探索 Forge” showcase at `/explore`, registered through a feature manifest.
- Feature 彩虹胶囊 and 委托 with explanatory mini visuals; provide category exploration and accessible detail drawers.
- Describe verified capabilities and link to existing entry points with accurate next-step instructions.
- Add a delegation capability manual with server/client responsibility diagrams, selectable protocol walkthroughs, actual SDK onboarding and recovery guidance. Correct delegation copy to describe constrained access to an existing session by a designated participant.
- Exclude metrics, search, AI recommendations, backend changes and automatic task creation.

## Capabilities

### New Capabilities

- `forge-capability-showcase`: Product introduction, category browsing, capability details and existing-tool navigation.

### Modified Capabilities

None.

## Impact

New `frontend/src/features/forge-explore/` feature only. Uses existing showcase layout, theme tokens and Radix Sheet. No dependencies, API or database changes. Evidence: user brief, feature manifests, assistant integration page and ChatPage delegation entry. No unresolved business decisions.
