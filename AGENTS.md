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

  Engine-neutral Forge Quality Gate:

  When the `forge_verify` MCP tool is available, use it as the single agent-facing entry point with `phase: all`.
  Fall back to the CLI commands below when MCP is unavailable.

```powershell
./scripts/forge-quality.ps1 detect -Project . -Format json
./scripts/forge-quality.ps1 verify -Phase static -Project . -Format json
./scripts/forge-quality.ps1 verify -Project . -Format json
```

Codex and Claude Code must use the JSON `status` plus process exit code as the quality decision. Full verification runs Static first and only runs Runtime after Static passes. A checker/verifier absent from `executedCheckers`/`executedVerifiers` was not run and must not be reported as passed.

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

Menu RBAC metadata is generated from the same manifests by `frontend/scripts/generate-feature-permissions.mjs`.
`npm run dev` and `npm run build` refresh `frontend/public/feature-menu-permissions.json`; the packaged backend
loads that catalog and syncs it into `forge_permission` at startup. Do not add menu entries to Java manually.
Use `npm run feature-catalog:check` to detect a stale generated catalog.

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
- **Frontend UI Art Direction**: 遵循 `quiet-luxury-ui` 技能规范（*Quiet Luxury Enterprise UI*：Swiss editorial layout + Apple HIG hierarchy + Linear-level restraint + Vercel-level precision）。严禁 AI 套路（全盘套卡片、Card套Card、巨大圆角/阴影、48px+巨型状态图标、机械死板居中、蓝紫渐变/无意义毛玻璃）。状态页以工作流恢复（Context → State → Explanation → Recovery Action）为主，严禁 Dead End。详见 `.agents/skills/quiet-luxury-ui/SKILL.md`。

## Project Registry and System Init

- `/tools/project-workspace` is the central Project Registry, including local project discovery, directory settings and module workspaces. Legacy `/tools/projects` and `/tools/project-workspace/modules` redirect to its `section=local` and `section=modules` views. Reuse existing configuration storage through public APIs; do not add parallel project configuration.
- `tools/tool-projects/.../projects/registry/` owns registered system identities, initialization runs and versioned System Profiles. Graphify remains the code graph authority; OpenSpec remains the behavior authority.
- Register a system through `/api/project-registry`, run `POST /api/project-registry/{id}/init` with `mode: FULL`, then read `/api/project-registry/{id}` for actual readiness, five asset groups, source fingerprint and gaps. `SYNC` uses Graphify structural change detection, AST caching and changed-path reconciliation before refreshing evidence. It requires valid graph/manifest baselines and preserves old artifacts/profile on failure; semantic/community analysis is not rerun. The bundled bridge is verified against graphifyy 0.9.16; `toolbox.projects.graphify-python` selects a trusted installed Python interpreter (default `python`).
- Registry tasks use the existing requirement registration port. Their system/profile bindings are separate from task lifecycle; Agent handoff is available at `/api/project-registry/{id}/tasks/{taskId}/context`.
- `AI_READY` describes available engineering context, not passing builds, verified DDL or runtime correctness. Missing, partial and stale evidence must remain explicit. Preserve the previous profile when initialization fails.

## AI 开发完成与自动提交

本项目采用 AI 辅助开发工作流；本节是 Codex、Claude Code 和其他仓库 Agent 的统一收尾约束。

- 每完成一个可独立验收的功能、修复或重构，更新相关 OpenSpec 任务与必要文档，执行适用测试及项目质量门禁，通过后立即自动 `git commit`，不积累到下一轮。用户已授权此行为，无需再次询问；用户明确要求不提交时除外。
- 开始工作时记录 Git 状态；提交前核对 diff 与暂存区，只提交本任务完成的改动。用 `git add <具体路径>`，禁止 `git add -A` / `git add .`。同一文件混有其他任务改动时按块暂存；不能可靠拆分时说明阻碍，不擅自提交、还原或 stash 他人改动。
- 验证失败、实现未完成、存在冲突或提交失败时，不伪称完成，不跳过检查或 hooks；修复后再提交，不能修复则明确报告原因与未提交范围。运行日志、依赖缓存、凭据和临时产物不得进入提交。
- 提交信息使用 `type(scope): 中文标题`，正文包含 `【改动】`、`【原因】`、`【结果】`，Author 读取真实 Git 配置，禁止 AI 署名。已安装 `git-commit-standards` 时使用其消息生成器；本项目用户授权优先于 Skill 默认的再次确认步骤。
- 默认自动 commit，不自动 push；只有用户明确要求推送时执行 push。本节替代旧的默认 commit + push 约定。
- 收尾回复必须说明验证结果及 commit 短哈希；若没有提交，明确原因。没有实际执行成功的 commit，不能声称已提交。

## Reference docs

- `README.md` — short user-facing overview
- `docs/design/architecture.md` — full design rationale, TreeSize API/SSE contract, SQLite schema, and explicit "won't build" list. Read before adding a new tool or extending TreeSize.
