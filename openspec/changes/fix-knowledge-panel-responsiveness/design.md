## Context

KnowledgeGraphCard enables Graphify and repository-path queries on expansion. Graphify has zero stale time and default focus refetch/retries; status wrappers do not accept cancellation signals. The server walks graphify-out and reads Git output before its timeout wait. These establish unbounded request/work risks, but do not alone establish main-thread freezing.

## Goals / Non-Goals

Make expansion a local UI operation, retain cached evidence with its timestamp, and allow explicit bounded live checks. Do not rewrite the server detector or 3D renderer based only on this screenshot. Do not launch an Agent or update any graph while diagnosing.

## Decisions

The Graphify query remains disabled until the user requests a check. Closing the panel resets the live-check request and React Query aborts the fetch. Business sections retain their lazy checks but consume cancellation and a 15-second deadline. Disable automatic retries and focus refetch for these potentially costly operations. Repository paths are fetched only when launching a business bootstrap. Show independent Graphify results in the heading immediately; do not require all three checks to finish first. Do not present cached status as fresh.

## Risks / Trade-offs

An explicit check adds one click but prevents merely expanding the panel from launching disk work. Cancelling HTTP does not guarantee cancellation of server-side filesystem work. Browser approval remains pending, so browser responsiveness and the exact reported freeze remain unverified until reproduced.

## Verification

Use focused React tests with delayed requests to verify expand/collapse, explicit check, query counts and cancellation; test cached-state rendering and failed-check recovery. Run frontend build and Forge gate. Keep this change active if browser diagnosis remains unresolved.
