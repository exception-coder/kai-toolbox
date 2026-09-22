# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Product and interaction philosophy

Before adding navigation, object actions, dialogs or AI workflows, read [docs/product-philosophy.md](docs/product-philosophy.md). Record applicable principle IDs and exceptions in the OpenSpec design; preserve object context, operation feedback and keyboard/mobile recovery. The [AI coding architecture](docs/ai-coding-architecture.md) owns the context-layering contract; do not duplicate these documents in agent-specific rules.

## AI 编程架构套件同步约定

[AI 编程架构说明](docs/ai-coding-architecture.md) 是 Forge、Team Standards、OpenSpec、Graphify 和 Agent 协作方式的唯一整体架构说明。修改组件职责、上下文/证据流、规格或概设详设触发条件、分支与任务策略、MCP/Hook 门禁、验证或交付生命周期时，必须在同次作业中同步受影响正文、流程图和能力边界，并随实现提交；跨仓改动在对应仓库分别提交。不因文件数或行数判断是否重大。

普通 Bug 修复、样式/措辞调整、保持上述契约的内部重构无需更新本文，在提交正文说明无架构影响即可。不得仅修改日期或另建同主题副本；未实现、未部署、未验收必须分别标明。具体维护规则见该文档“维护契约”；此约定不授予服务重启或发布权限，也不强制为文档维护创建 OpenSpec Change。

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

- `ProjectCatalog` is the project domain's authoritative directory inventory, implemented in `tool-projects/catalog`; `ProjectDirectorySource` only supplies scan roots. Consumers project the catalog instead of scanning or merging their own lists. `ProjectAccess` enforces global excluded paths and descendants at loading/execution boundaries. `/api/project-catalog` serves normal consumers; `includeExcluded=true` is the administration inventory, and `PUT /api/project-catalog/visibility` changes policy through existing dynamic configuration. Registered identities/names take precedence; aliases adapt through `ProjectDisplayNames`. Business provisioning templates and knowledge directories are not runtime project identities. Preserve source files and history on exclusion; cancellation remains possible for already-running work.
- Hierarchical Git changes use `GitChangeTree` and its pure tree model; preserve directory expansion, original rename paths and index/worktree statuses. Counts describe changed entries, since untracked directories may be collapsed by Git itself.

- `/tools/project-workspace` is the single Project Registry list; local discovery belongs to Add Project. Project details default to an AI workspace scoped to the registered path, with existing module actions and session IDs. Legacy `section=local` opens discovery; `section=modules` restores the last registered path or returns to the list. Project discovery and local operations share `ProjectDirectorySource`; directory settings edit workspace roots and atomically retire the legacy single-root fallback on first save. Reuse existing configuration storage through public APIs; do not add parallel project configuration.
- `tools/tool-projects/.../projects/registry/` owns registered system identities, initialization runs and versioned System Profiles. Graphify remains the code graph authority; OpenSpec remains the behavior authority.
- Register a system through `/api/project-registry`, run `POST /api/project-registry/{id}/init` with `mode: FULL`, then read `/api/project-registry/{id}` for actual readiness, five asset groups, source fingerprint and gaps. `SYNC` uses Graphify structural change detection, AST caching and changed-path reconciliation before refreshing evidence. It requires valid graph/manifest baselines and preserves old artifacts/profile on failure; semantic/community analysis is not rerun. The bundled bridge is verified against graphifyy 0.9.16; `toolbox.projects.graphify-python` selects a trusted installed Python interpreter (default `python`).
- Registry tasks use the existing requirement registration port. Their system/profile bindings are separate from task lifecycle; Agent handoff is available at `/api/project-registry/{id}/tasks/{taskId}/context`.
- The project Domains tab starts read-only Codex/Claude exploration through `POST /api/project-registry/{id}/domains/explore`; `GET /api/project-registry/{id}/domains` reads persisted progress and drafts. Graphify supplies node/community evidence, and the Agent traces source code; existing OpenSpec or domain documentation is optional. `.forge/domains/snapshot.json` is the single current domain snapshot, with exact source citations, confidence and coverage gaps. Re-exploration replaces that snapshot only after validation; it is not semantic incremental sync. System Init collects it on the next sync, and task handoff reads it with an explicit freshness warning. Code-derived meaning and code-referenced tables are not verified business rules or live DDL.
- `AI_READY` describes available engineering context, not passing builds, verified DDL or runtime correctness. Missing, partial and stale evidence must remain explicit. Preserve the previous profile when initialization fails.

## AI 开发完成与自动提交

### 服务重启必须经用户明确确认

本项目是 AI 原生项目。AI 可以主动完成开发、构建、测试和问题诊断，但不得自行重启我们的服务；本节是所有仓库 Agent 的统一授权边界，优先于自动验收、自动修复和交付流程。

- 每次执行或触发服务重启前，必须说明目标服务、重启原因及预计影响，并等待用户对本次重启明确确认。用户未回复、一般开发授权、历史重启授权或“完成任务”的要求均不构成本次重启许可。
- 此约束覆盖命令行、页面按钮、HTTP/MCP 接口、PM2、守护器、脚本、委托 Agent、源码自动更新交接等直接或间接重启方式。不得通过停止后启动、替换进程、触发 reload/热重载或启用自动重启来绕过确认。
- **唯一入口与严禁自制重启**：
  - 本项目运行栈由 PM2 守护管理，唯一合法的运行控制入口是根目录的 `node forge.mjs`（详见 `scripts/STARTUP.md`）。
  - **严禁自制起停逻辑**：严禁使用 `taskkill`、`pkill`、`kill -9` 强杀端口；严禁自行在后台或终端执行 `mvn spring-boot:run`、`npm run dev` 或 `java -jar` 抢占已有受管端口；严禁创建临时启动/重启脚本（如 `.bat`/`.ps1`）。
  - 授权后的正规操作必须使用：全量重启 `node forge.mjs restart`，或定向重启 `node forge.mjs restart --scope backend` / `--scope frontend`。
- 未获确认时，完成可独立进行且不会触发重启的代码、构建、测试和只读检查，保留当前服务运行状态；将目标版本启动、运行验收和稳定观察明确标记为“待用户确认重启后执行”，不得为完成交付自行重启，也不得宣称新版本运行验收通过。
- 故障修复后需要再次重启时，也必须重新取得用户明确确认。仅修改文档不得触发服务重启。

### 自动编译与重启必须完成运行验收

本节是所有仓库 Agent 执行或触发自动编译、启动、重启、源码自动更新后的强制交付约束；适用于 Codex、Claude Code 及 Forge 委托的 Agent。它不授予重启权限；涉及重启必须先满足上节的用户确认要求。

- 成功必须形成闭环：构建成功 → 目标版本启动 → 运行验收 → 稳定观察 → 提交与交付。不得在“已发起重启”、Maven `BUILD SUCCESS`、命令 exit 0、PM2 `online` 或端口开放时提前结束任务；这些均不能单独证明应用启动成功。
- 开始前记录当前 Git 状态、目标工作区/源码版本、运行模式、服务范围及实际端口，复用 `node forge.mjs status` 和现有运行管理入口。按实际运行配置检查，不能假定端口是 8080，也不能把旧进程的健康响应当成新版本启动成功。
- 重启后必须使用 `node forge.mjs logs backend`（或对应服务）核验最新启动日志，确保没有致命异常；并使用 `node forge.mjs status` 确认受管服务进入 ready/online。
- 构建必须覆盖受影响模块及宿主装配；依赖、自动配置、模块注册变更须验证完整宿主类路径，不能只跑单模块测试。前端变更执行适用的 typecheck/build，打包模式确认本次前端产物已进入目标制品。
- 运行验收必须同时核对：预期服务 ready、实际 HTTP 健康/业务响应符合预期、受影响功能的适用冒烟验证、当次启动日志没有致命启动异常。`node forge.mjs status` 当前端口探测结果仅为辅助证据；质量门禁仍按 JSON `status` 和退出码判断，未执行的检查不得记为通过。
- 验收后至少连续观察 60 秒，起止复查进程身份、重启次数和 HTTP 响应，确认没有崩溃、退出或重启次数增长。新增重启、目标进程变化或探测失败必须重新诊断并重新计时；启用且属于本次交付范围的服务必须全部通过，其他服务异常应明确单列。
- 遇到编译失败、启动超时、依赖冲突、应用异常或运行验证失败，执行任务的 AI 必须主动读取当次日志、定位根因、在已授权范围内修复，并重复适用的构建和验证；修复本身不需要用户再次说“修复”，但任何再次重启都必须先取得用户对本次重启的明确确认，确认前保持待运行验收状态。守护进程的自动重试不等于 AI 修复，不得在无新证据或修正的情况下无限重复同一失败操作。
- 不得通过关闭必要服务、删除验证、放宽健康条件、跳过 hooks、修改无关数据或覆盖他人改动来制造成功。若依赖凭据、外部服务、权限或破坏性操作导致无法继续，明确报告阻塞证据、当前运行状态及所需最小协助，保持任务未完成；有已验证且适用的恢复路径时先恢复可用性，恢复旧版本不代表新版本交付成功。
- 收尾必须给出构建/专项测试/运行门禁结果、目标版本与运行范围、稳定观察结果及 commit；尚未成功不得标记 OpenSpec 交付完成或宣称修复完成。仅修改文档且没有触发运行变更时，无需为验收而重启服务。

上述规则约束 Agent 行为；无人值守运行程序只有实现并验证了故障证据采集、Agent 修复调度和再次验收后，才能宣称具备自动修复能力。修改本文件本身不代表该能力已实现。

### 自动提交与交付记录

本项目采用 AI 原生开发工作流；本节是 Codex、Claude Code 和其他仓库 Agent 的统一收尾约束。自动提交授权不包含服务重启授权。
- 每完成一个可独立验收的功能、修复或重构，更新相关 OpenSpec 任务与必要文档，执行适用测试及项目质量门禁，通过后立即自动 `git commit`，不积累到下一轮。用户已授权此行为，无需再次询问；用户明确要求不提交时除外。
- 开始工作时记录 Git 状态；提交前核对 diff 与暂存区，只提交本任务完成的改动。用 `git add <具体路径>`，禁止 `git add -A` / `git add .`。同一文件混有其他任务改动时按块暂存；不能可靠拆分时说明阻碍，不擅自提交、还原或 stash 他人改动。
- 验证失败、实现未完成、存在冲突或提交失败时，不伪称完成，不跳过检查或 hooks；修复后再提交，不能修复则明确报告原因与未提交范围。运行日志、依赖缓存、凭据和临时产物不得进入提交。
- 提交信息使用 `type(scope): 中文标题`，正文包含 `【改动】`、`【原因】`、`【结果】`，Author 读取真实 Git 配置，禁止 AI 署名。已安装 `git-commit-standards` 时使用其消息生成器；本项目用户授权优先于 Skill 默认的再次确认步骤。
- 默认自动 commit，不自动 push；只有用户明确要求推送时执行 push。本节替代旧的默认 commit + push 约定。
- 收尾回复必须说明验证结果及 commit 短哈希；若没有提交，明确原因。没有实际执行成功的 commit，不能声称已提交。

## System resources and AI discovery

- `/tools/reqpool` is the AI application list backed by Project Registry identities. `/tools/reqpool/apps/:systemId` shows that application's OpenSpec tasks; `/tools/reqpool/requirements` retains the existing requirement delivery workflow.
- Application/OpenSpec association uses an unambiguous full source-directory match from `ProjectSummary.sourcePath`, never display names or inferred child directories. Missing or ambiguous associations remain explicit. The legacy board redirects to `/tools/reqpool/changes`; reuse the existing official CLI-backed board through its public API.

- `/tools/reqpool/resources` is the AI delivery center entry for system resources and test accounts. Legacy `/tools/ops` redirects to its connections view; preserve existing resource IDs, credentials and history.
- Project Registry owns system identities. `ResourceProvider` and `ProjectSystemDirectory` in `toolbox-common` are stable ports; implementations stay in their owning modules and register as Spring beans. Do not add tool-to-tool dependencies or copy credentials into relation records.
- `SystemResourceService` in `tool-ops` owns resource bindings and current-state validation. Claude SDK tools and stdio MCP both expose `discover_resources` and `execute_resource` through `/api/ops/resources`. SQL execution is read-only; app calls retain their connector target restrictions. Discovery returns metadata and credential presence only.
- Add provider capabilities only when implemented. Current providers cover ops data sources and ERP/SRM test application profiles; registration-only middleware and unavailable providers remain explicit. See `openspec/changes/unify-system-resource-discovery/design.md` for extension and compatibility boundaries.

## Reference docs

- `README.md` — short user-facing overview
- `docs/design/architecture.md` — full design rationale, TreeSize API/SSE contract, SQLite schema, and explicit "won't build" list. Read before adding a new tool or extending TreeSize.
