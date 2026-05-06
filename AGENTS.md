# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project shape

`kai-toolbox` is a local single-user toolkit platform: one Spring Boot shell + multiple pluggable tool modules, served at `http://localhost:8080`. No auth, no multi-tenancy. Stack: Java 21 / Spring Boot 3.4 / Maven multi-module on the backend; Vite 6 + React 19 + Tailwind v4 + React Router v7 + TanStack Query on the frontend. SQLite (via Spring JDBC) for persistence; SSE (`SseEmitter`) for streaming progress.

## Common commands

Backend (run from repo root):

```powershell
mvn clean install                                         # build all modules
mvn -pl toolbox-starter -am spring-boot:run               # run dev server on :8080
mvn -pl toolbox-starter -am clean package                 # produce fat jar
java -jar toolbox-starter/target/kai-toolbox.jar          # run the packaged jar
mvn -pl tools/tool-treesize -am test                      # build/test a single tool module
```

Frontend (run from `frontend/`):

```powershell
npm install
npm run dev          # Vite on :5173, proxies /api -> :8080
npm run typecheck    # tsc -b --noEmit
npm run build        # tsc -b && vite build (output: frontend/dist)
```

Production fat-jar form embeds the built frontend under `toolbox-starter/src/main/resources/static/` — copy `frontend/dist/*` there before `mvn package` (see `docs/design/architecture.md` §7).

Runtime data (SQLite DB) lives at `${user.home}/.kai-toolbox/toolbox.db`, configured in `toolbox-starter/src/main/resources/application.yml`.

## Architecture: how a "tool" plugs in

A tool has two halves that register **independently** — the frontend is the single source of truth for the menu; the backend registry is optional/future-facing.

### Frontend registration (authoritative for UI)

`frontend/src/shell/featureRegistry.ts` uses `import.meta.glob('../features/*/index.tsx', { eager: true })` to auto-collect every feature's manifest at build time. Each feature exports a default `FeatureManifest` (see `frontend/src/shell/types.ts`) containing `id`, `name`, a Lucide `icon` *component reference* (not a string — avoids string→component mapping), `group`, `order`, and `routes`. `App.tsx` flattens those routes into the router. **Adding a new tool = create `frontend/src/features/<id>/index.tsx` exporting a manifest; no router/sidebar edits needed.** Sidebar and home page both read from `features`, so the menu works even if the backend is down.

### Backend registration (optional, for cross-tool service discovery)

Each tool module defines a `@Component` implementing `com.exceptioncoder.toolbox.common.tool.ToolDescriptor`. `ToolRegistry` collects all beans and exposes them at `GET /api/tools`. The current frontend does **not** read this — it's reserved for future tool-to-tool discovery on the server. Don't add UI logic that depends on `/api/tools`.

### Per-tool SQL schema convention

`SchemaInitializer` (in `toolbox-common`) runs at startup, scanning `classpath*:db/*-schema.sql` across all modules. Each tool ships its tables as `tools/tool-<id>/src/main/resources/db/<id>-schema.sql`. **All statements must use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`** — the splitter is naive (`split(";")`) and runs every startup, so non-idempotent DDL will break.

### SSE pattern

Long-running work (e.g. scans) uses `SseEmitterRegistry.create(key)` to mint an emitter for a task ID, then publishes events from worker threads via `publish(key, eventName, payload)`. `application.yml` sets `spring.mvc.async.request-timeout: -1` to keep SSE connections open. Virtual threads are enabled (`spring.threads.virtual.enabled: true`) — use them for scan workers.

## Module layout

```
toolbox-common/        # ToolDescriptor + ToolRegistry, SseEmitterRegistry,
                       # SqliteConfig (WAL + FK on), SchemaInitializer,
                       # GlobalExceptionHandler. No tool-specific code here.
toolbox-starter/       # @SpringBootApplication; depends on common + every tool module.
                       # Adding a tool = add a <dependency> here AND in the parent pom <modules>.
tools/tool-<id>/       # One Maven module per tool. Owns its api/, domain/, repository/,
                       # service/, config/<Id>ToolDescriptor, and resources/db/<id>-schema.sql.
frontend/src/shell/    # AppShell, Sidebar, TopBar, HomePage, featureRegistry, types
frontend/src/features/ # One folder per tool; index.tsx exports the FeatureManifest
frontend/src/lib/      # api client + cn() util
frontend/src/components/ui/  # shadcn-style primitives (manually authored, not CLI-generated)
```

The Vite alias `@` → `frontend/src` is the canonical import root.

## Conventions to preserve

- **No premature infrastructure.** The architecture doc (§6) explicitly excludes task scheduling, MQ, Redis, auth, and notifications. Add a middleware only when a concrete tool needs it; don't pre-abstract.
- **Tools are sandboxed by schema, not by package boundary.** Each tool owns its own SQLite tables; tools don't query each other's tables. Cross-tool needs go through `/api/tools` (future) or shared common services.
- **Frontend menu must keep working with the backend down.** Don't move feature metadata to the server; keep `FeatureManifest` as the source of truth.
- **Lucide icons by component reference**, not string name, in `FeatureManifest.icon`. The backend `ToolDescriptor.icon()` returns kebab-case strings, but that path is currently unused by the UI.

## Reference docs

- `README.md` — short user-facing overview
- `docs/design/architecture.md` — full design rationale, TreeSize API/SSE contract, SQLite schema, and explicit "won't build" list. Read before adding a new tool or extending TreeSize.
