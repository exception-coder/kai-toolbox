## Context

基线 e5e7adaa。Graphify 定位 ModuleCard → ProjectWorkspacePage，图谱可能陈旧，已按当前源码核对。模块来源 knowledge 表示知识清单；仅 relPath 位于 frontend/src/features 的条目可以归为前端功能目录。已有工作区改动不纳入本次提交。

## Goals / Non-Goals

提升模块清单密度及前端视角可读性；不变更识别、启动、聚合和后端。轻量前端变更，使用 compact-project-module-list 作为唯一设计载体。

## Decisions

CONSERVATIVE：复用现有 Button、字体、颜色、分隔线；去掉逐项大卡片、主色大按钮及 knowledge/未打开标签。新增 WorkspaceModuleList 统一紧凑行与递归展开，项目页保持原有筛选和回调。桌面最多三列，窄屏单列，路径可截断但 title 保留全值，图标操作带明确 accessible name。

默认 12 个顶层条目，可展开全部/收起；搜索不截断结果。项目切换以 key 重置展开状态。子模块默认折叠并明确标示数量，展开后保留各节点操作。已有会话状态使用图标与按钮名，加载期间禁用对应打开操作。

## Risks / Trade-offs

- 折叠可能降低发现性：显示总数和剩余数，搜索呈现全部命中。
- 图标含义可能不清晰：tooltip、aria-label，已有会话与新建图标不同。
- 混合模块不能称为全部前端：仅全体符合目录前缀时显示前端功能模块，其他情况为项目模块。
- Agent 自审：保留真实会话/钉选回调，不添加后端依赖或平行模块数据。

## Verification

组件行为测试覆盖分页展开、搜索、子模块、会话/钉选与等待状态；typecheck/build，Forge gate，真实桌面/窄屏视觉和运行观察至少 60 秒。前端 dev 由 Vite 更新，未改后端无需为此重启 Java。
