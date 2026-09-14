## Context

AssistantBridge initializes the standalone Shadow DOM widget with a consult WebSocket. AssistantWebSocketTransport owns page identity, history and submissions. NativeVoiceConnection already owns WebRTC resources; SessionVoiceService and codexEngine currently reject consult-readonly voice. Graphify was queried; current source and working-tree diffs supply newer voice evidence.

## Goals / Non-Goals

Support explicit voice in the same consultation and message viewport. Preserve read-only execution and existing project routing. Do not grant development permission or create a second chat. Do not promise joining a non-voice native turn before the underlying engine supports it.

## Decisions

- Expose the framework-independent media class through a narrow public-api/voice entry. AssistantVoiceSession owns negotiation, timeout, heartbeat, mute and cleanup; Widget only renders controls.
- AssistantWebSocketTransport sends ephemeral voice offers with captured page developer instructions. It dispatches voiceEvent before sequence/debug/persistence handling and projects only transcript text into existing messages. Offers are never retried automatically or persisted.
- SessionVoiceService and Codex engine accept only default or consult-readonly official Codex voice. Existing consultation tool/config restrictions remain unchanged; delegated/review/disabled/third-party policies remain rejected.
- Page navigation, close, authentication loss, socket loss and destruction stop media. Recovery is an explicit new click, never automatic microphone capture. Late events are scoped by call identity.
- Existing code-native-voice takeover remains a dependency, not copied into the SDK. SDK UI retains the existing quiet controls and message hierarchy.

## Risks / Trade-offs

Audio permission and provider availability require real audio acceptance. Current browser saved policy blocks localhost:5173; no alternate access will bypass that restriction. Unit tests establish lifecycle and protocol behavior, not audible speech. Existing voice takeover work is dirty and remains identifiable separately.

## Migration Plan

Build SDK, frontend, sidecar and host; validate focused tests and existing consult security tests. Activate through managed runtime only after safe handoff; observe target ready for 60 seconds. Roll back the scoped change and rebuild, without database operations.
