## Why

项目工作台目前以目录、模块和会话组织操作，系统身份、初始化结果和任务上下文没有统一的持久化契约。将项目注册与初始化分离，让 Agent 在系统范围内消费可追溯画像。

## What Changes

- 将项目工作台主入口重构为集中项目库与项目详情，注册不自动执行代码或初始化。
- 增加持久化 Full Init 运行、分阶段结果、失败恢复、版本化五类 System Profile 资产和显式就绪状态。
- 增加必须绑定系统的任务记录与 Agent 交接上下文，不要求选择代码模块。
- 保留已有模块工具的兼容入口；不迁移或覆盖历史需求和会话。
- 第二阶段再实现业务域自动归纳、自动变更监听和局部图谱重建；第一阶段提供手动同步画像与明确的待处理证据。

## Capabilities

### New Capabilities

- `forge-project-registry`: 集中注册、配置和查看系统身份及就绪状态。
- `forge-system-init`: 初始化运行、五类资产、画像版本和证据新鲜度。
- `forge-system-tasks`: 系统级任务持久化与画像上下文交接。

### Modified Capabilities

无既有 accepted spec 的行为要求需要改写。

## Impact

- `tools/tool-projects` owns registry, initialization and task state; no direct tool-module dependencies.
- `frontend/src/features/project-workspace` becomes the registry UI, reusing shared UI and claude-chat public launch capability.
- New `/api/project-registry` contracts and idempotent startup schema; no manual production data migration.
- Evidence: existing ProjectWorkspacePage, OnboardService, Graphify status service, workspace public API, Graphify graph and targeted current source. Graph manifest predates HEAD `fcc87f15`; source reads override stale graph results.
- Research: https://backstage.io/docs/features/software-catalog/system-model/ supports separating systems from implementation components; https://github.com/Graphify-Labs/graphify/releases documents version-specific graph reconciliation. Installed capability is authoritative for execution.
- No unresolved business choice: implement the user's first-phase scope; never infer AI readiness from a successful directory scan.
