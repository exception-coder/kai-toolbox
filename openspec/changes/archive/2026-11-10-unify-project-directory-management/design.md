## Context

`ProjectDirectorySettings.tsx` 已通过 config-center/public-api 编辑三个现有配置块，但未覆盖隐藏前缀、缓存与命令超时。`ConfigCenterPage.tsx` 仍重复提供编辑。`GraphifyQueryService`、`PrdTopologyContextService` 直接 Binder 读取 workspace.roots；`WorkspaceScanService` 已实现 LocalProjectResolver，并通过 WorkspaceRootResolver 纳入托管源码。源码定向核验补充当前 Graphify 的新鲜度缺口。

## Goals / Non-Goals

目标：完整集中管理，旧值无损，查询通过现有端口复用项目发现。非目标：配置键重命名、源码搬迁、数据库迁移、默认目录与 AI 工作区写权限合并。

## Decisions

- 以项目库目录页为唯一 UI 编辑入口；配置中心过滤三个块并兼容其深链。API 继续保留所有块，避免破坏客户端及运行时刷新能力。
- 保留存储键而非双写新键，避免环境变量、YAML、SQLite 三层优先级迁移歧义。目录管理迁移的是入口和消费方式，原值直接读取。
- 每个配置块独立保存；高级选项与目录同块提交差异，替换列表时显式传 replacePrefixes；未改字段不发送，减少覆盖其他设置的风险。
- 三种目录保留不同用途，默认项目文件操作继续沿用原边界。分别展示两类扫描规则，解释适用范围；托管 Git 超时使用秒显示、毫秒存储。
- PRD 查询注入 ObjectProvider<LocalProjectResolver>，避免新增 tool-to-tool 依赖；无解析器或无项目时返回现有缺失结果。Graphify 已有显式绝对路径契约保留。

## Risks / Trade-offs

- 隐藏整个旧块可能使选项不可达 → 将三个配置类定义的目录、扫描和超时字段完整覆盖到目录页；独立的 Graphify 查询配置块仍保留。
- 查询采用统一发现后会遵循隐藏规则 → 测试管理源码、未找到项目与显式路径；不增加目录权限。
- 共享工作树存在其他任务 → 仅提交本次路径，不覆盖 Graphify/OpenSpec 应用页等并行改动。

## Migration Plan

无需数据迁移。部署后旧深链跳转目录页，旧 API 与配置持久值可继续使用。回滚本次源码即可恢复原入口。验证包括前端设置与跳转回归、后端路径解析测试、宿主构建、Forge 门禁、浏览器验收及启动后至少 60 秒稳定观察。

## Open Questions

无。运行前已发现后端因旧 Sidecar 端口占用反复构建失败，先用 Forge 生命周期入口恢复并按实际 PID/HTTP/日志验证。
