## Context

`ToolboxApplication.java:19` waits for restart handoff before constructing Spring. `scripts/internal/run-supervised.ps1:680` mixes Maven and Java launch. DevTools is deliberately disabled in `application.yml:21`. Preserve these lifecycle decisions. Existing working-tree changes concern the project registry and are outside this change.

## Goals / Non-Goals

Measure distinct stages and retain repeatable JSON evidence. Add a platform module with no dependency on business tools or toolbox-common. Integrate timing into the supervisor while preserving its lifecycle, Maven goals and tool initialization. No storage schemas are introduced. Delivery includes diagnostic API, optional measurement command and a frontend feature registered through its manifest.

## Decisions

- Supervised integration: keep `scripts/run-supervised.cmd` as the daily entry. Its backend child invokes an internal measured command wrapper with unchanged Maven goals and Java options. Full mode measures Maven package via Stopwatch; dev mode records the interval from Maven invocation to the application JVM start (includes Maven preparation/compilation/fork, explicitly not pure compilation). Scalar JVM properties carry per-launch metadata without files, environment dumps or request secrets. Ordinary startup without metadata stays NOT_MEASURED. Hot context reload keeps initial JVM build attribution; it does not claim to measure hot compilation. Replacement JVM handoff must strip inherited performance launch properties to prevent stale attribution. No extra app instance, database or service is introduced.
- The existing snapshot API gains optional-compatible build metadata. The page reads it automatically, labels its scope, and treats import/export as optional offline diagnostics. Daily instructions point to run-supervised.cmd.

- `toolbox-performance` owns a thread-safe run recording, Spring bootstrap listener, bounded BufferingApplicationStartup and MVC observation. Starter depends on it; tool-specific adapters live in the starter composition root. Domain records use elapsed milliseconds and explicit status; pending or unavailable values remain null.
- Bootstrap wiring at main entry records JVM uptime, main entry and Spring invocation independently. ApplicationStartedEvent records refreshed context, ApplicationReadyEvent records readiness event observation. These are milestones, not additive durations; Spring step durations are inclusive and overlap.
- Buffer up to 2048 Spring steps; expose a read-only snapshot of the slowest 100 with parent IDs, names and only beanName/beanType tags. Report capacity saturation. Do not drain on GET.
- `GET /api/performance/startup` is covered by existing configured admin-only authentication. It returns one current in-memory run, not historic/global performance. First API success means completed synchronous MVC HandlerMethod returning 2xx, after readiness; exclude diagnostic/health/error routes and use route templates only. SSE completion is not a valid first-response measure.
- Background readiness records only explicit observations. Starter adapts FFmpeg availability and aria2 enabled/readiness after initialization, and declares coverage partial. No claim is made for RAG or other uninstrumented tasks.
- `scripts/measure-startup.ps1` uses a separate, explicit package-and-launch path: capture Maven build wall duration/exit code, launch a jar on a caller-selected port and isolated data directory, await this run's ready report, optionally request a caller-selected safe GET target, persist JSON on failure/timeout, stop only the process it owns. Refuse a busy port. Existing live service is never stopped. Build is labeled Maven package, not pure javac; optional SkipBuild yields NOT_MEASURED.
- Reports use unique run IDs and a unique report directory passed as a JVM property. Runtime report writes are atomic and telemetry I/O failure logs a warning without failing the application. API snapshots are bounded; no bodies, query strings, headers or credentials are captured.

## Risks / Trade-offs

- Measurement adds small bounded overhead; report it as instrumentation enabled, not an uninstrumented baseline.
- Optional tools can have real external effects; launcher is opt-in and uses isolated local data, with optional integrations disabled where configurable.
- Full-mode Maven duration uses Stopwatch and JVM milestones use uptime. Dev-mode preparation spans processes and uses UTC timestamps; clock adjustments can affect it, and invalid or over-24-hour intervals remain unmeasured.
- A full application may fail because of unrelated local configuration; keep failure evidence and use a minimal real HTTP application to verify collection independently.

## Migration Plan

Add module/POM wiring, bootstrap and adapter, then measurement launcher. Verify unit/concurrency and real HTTP startup, failed build/report paths and PowerShell parsing. Run Forge quality gate phase all and report actual executed checks. Roll back by removing starter bootstrap/adapter and dependency plus root module entry; there is no data migration.

## Open Questions

No blocking decisions. The page uses existing tokens, Button and TanStack Query in conservative mode. It distinguishes current-process runtime from Maven measurements, supports report import for the isolated measurement command, and provides refresh/export with recoverable errors.

## References

- [Spring Boot startup tracking](https://docs.spring.io/spring-boot/3.4/reference/features/spring-application.html)
- [BufferingApplicationStartup snapshot and capacity](https://docs.spring.io/spring-boot/3.4/api/java/org/springframework/boot/context/metrics/buffering/BufferingApplicationStartup.html)

## Usage

After restarting the updated backend, open the 运维 → 启动性能治理 menu at `/tools/startup-performance`. The JSON API is `GET /api/performance/startup`, under the host's configured administrator policy.

For daily use, continue starting `scripts/run-supervised.cmd`. Its internal backend wrapper automatically supplies build metadata to the application; the page reads it without a second script or report import. Default dev mode measures Maven invocation through application JVM creation, including preparation, compilation and process launch. Full mode measures Maven package separately. Hot context reload retains the initial JVM build observation; replacement JVM handoff clears inherited timing properties. Build failure preserves the Maven exit code and remains in supervisor logs because no application API exists yet.

For a separate build-and-launch measurement, run `./scripts/measure-startup.ps1 -Port 18090` from the repository root. Import the printed report.json into the page. `-SkipBuild` explicitly leaves build unmeasured and requires an already updated jar. `-TargetPath /api/tools` additionally times a safe HTTP GET; the target must not have side effects. The command is a Windows PowerShell launcher and aligns Maven JAVA_HOME with the selected java executable. `-ApplicationJar` optionally selects an instrumented jar, including process-protocol fixtures for tests. Output folders use unique run IDs.

The isolated run disables optional mail, aria2, browser-sidecar auto-start and RAG integrations, so compare runs using the same settings. It is not the live user's full-tool startup baseline. Reports retain failures. Without a target request, the command measures readiness only. It stops its owned JVM after measurement; it does not restart the live service.

## Verification evidence

- Supervisor integration: ten Java tests passed across the performance module and starter, including actual HTTP build metadata and replacement argument filtering. Three wrapper Pester tests passed for full/dev arguments and failed-build exit preservation. All 18 PowerShell scripts passed encoding and Windows PowerShell 5.1/PowerShell 7 parsing. Four frontend model tests and typecheck passed. Evidence: `outputs/supervised-integration-java.log` and `outputs/supervised-integration-forge.json`. Forge returned PASSED/exit 0 with no static checkers and nine existing API scenarios; the live backend was not restarted. The UI delta updates the existing stage row and explanatory text; earlier responsive browser evidence below covers the unchanged layout.
- Java: six tests passed, including real embedded Tomcat HTTP startup, report correlation, first successful route template, concurrency, failure/missing evidence, step capacity and tag allowlist. Command: `mvn -pl toolbox-performance -am test`.
- Launcher: six Pester tests passed, covering syntax, invalid input privacy, occupied-port preservation, Maven exit code 17, successful child report/cleanup, runtime exit code 19 and timeout. Child JVM protocol fixtures are not Spring performance baselines.
- Frontend: three model tests passed; `npm run typecheck` passed, including feature catalog consistency and feature dependency boundaries.
- Browser: actual production page rendered in an isolated Vite harness at 1440px and 390px using explicit synthetic data. Verified filtering, export/import round trip, invalid import preservation, permission failure/retry, no page errors and no document overflow. Screenshots and verification.json are in `outputs/startup-performance-ui/`; these values are fixtures, not measured startup results. Mobile auxiliary table columns are hidden to preserve step/duration readability.
- Full backend reactor compile passed. One repeat failed due to native memory allocation, then passed with Maven heap limited to 512 MB. No claim of performance improvement is derived from these compile runs.
- Forge phase all returned status PASSED with exit 0. Its `executedCheckers` was empty; nine existing API runtime scenarios executed. This does not establish static checker coverage or live deployment coverage of this new feature.
- The live service was not restarted. Full application cold-start attribution is collected on the next updated startup or an explicit measurement run. No SQL/database migration was introduced.
- Guardian: global registry exists without a project binding or established global tokens; conservative reuse of existing frontend tokens, Button/Input and quiet-luxury-ui. No competing design system was created.
