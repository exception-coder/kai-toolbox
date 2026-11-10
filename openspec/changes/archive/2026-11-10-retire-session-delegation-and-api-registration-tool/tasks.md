## 1. Product surfaces

- [x] 1.1 Remove Vibe Coding delegation navigation, owner panel and reference client route.
- [x] 1.2 Remove delegation Explore documentation and public browser SDK package/build entry.
- [x] 1.3 Remove affected API evidence UI and DTO projection from the OpenSpec board.

## 2. Server and Agent boundaries

- [x] 2.1 Remove delegation REST/WebSocket/relay controllers, domain services, repositories and configuration.
- [x] 2.2 Remove the Spring Boot relay starter module and host build/configuration references.
- [x] 2.3 Remove the `register_affected_apis` Tool, steering, HTTP/storage services and tests.
- [x] 2.4 Remove delegation-only Sidecar policy wiring while preserving ordinary CODE_AGENT/LLM controls.

## 3. Data and documentation

- [x] 3.1 Stop creating retired delegation and affected API tables without dropping existing data.
- [x] 3.2 Update user/developer documentation and retire superseded access instructions.

## 4. Verification and delivery

- [x] 4.1 Pass targeted frontend, backend and Sidecar tests/builds.
- [x] 4.2 OpenSpec strict validation passed; Forge Quality Gate Static and Runtime passed with 9 executed API runtime scenarios.
- [x] 4.3 Restarted Forge, verified frontend and surviving session API, confirmed retired routes are no longer registered, and observed stable backend/frontend PIDs with zero restart growth for 60 seconds.
- [x] 4.4 Review and commit only the retirement change with synchronized OpenSpec evidence.
