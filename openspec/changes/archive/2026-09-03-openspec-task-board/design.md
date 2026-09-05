## Context

`kai-toolbox` 已通过 `OpenSpecProjectService` 和 `OpenSpecCliGateway` 提供项目目录白名单校验、`openspec context --json` 探测及受控初始化，但尚无 change/task 聚合读取能力。现有 `delivery-center` 已形成左侧项目、中央工作区、右侧检查器的页面骨架，其数据语义是 PRD 交付阶段，不等同于 OpenSpec 任务。

本机 OpenSpec 1.6.0 已验证 `openspec list --json` 可返回活动 change、完成任务数、任务总数和更新时间，`openspec status --change ... --json` 可返回 artifact 路径，`openspec instructions apply --change ... --json` 可返回结构化任务数组。OpenSpec 输出是需求与任务事实；Graphify 和源码只用于确认当前实现坐标。

## Goals / Non-Goals

**Goals:**

- 建立项目、OpenSpec change 和 task 的稳定只读投影。
- 在一个工作台中支持项目总览、需求选择、任务状态列、详情检查和恢复操作。
- 保证任务完成事实来自 OpenSpec，执行态只接受可信 Runtime 证据。
- 在 CLI、单项目或缓存异常时提供局部降级，不让一个失败项目拖垮整个看板。
- 保持前后端 feature 边界清晰，并为后续 `session-autopilot` 状态融合预留接口。

**Non-Goals:**

- 不由看板自动执行、完成、编辑或归档 OpenSpec change/task。
- 不解析助手自然语言来推断任务状态。
- 不新增与 `tasks.md` 并行的数据库任务清单。
- 不把 PRD 交付阶段与 OpenSpec 实施任务合并为同一领域模型。
- 第一阶段不要求实时文件监听；显式刷新和有界缓存足够。

## Decisions

### 1. 后端通过 OpenSpec CLI 建立投影

在 `tool-claude-chat` 内新增聚合用例服务，由现有 `OpenSpecCliGateway` 执行固定 argv 命令：

- 项目探测：`context --json`
- 活动需求列表：`list --json`
- 需求元数据：`status --change <id> --json`
- 任务明细：`instructions apply --change <id> --json`

服务端解析并返回稳定 DTO，不把未经约束的 CLI JSON 原样暴露给前端。change id 必须来自当前项目 `list` 结果或通过安全名称校验；项目路径继续复用 `OpenSpecProjectService` 的允许范围规则。

选择 CLI 而非直接扫描 Markdown，是因为 CLI 已提供 schema 感知的结构化任务与真实 artifact 路径，能兼容 OpenSpec schema 演进。仅当明确支持旧版 CLI 时才增加受测的 `tasks.md` 回退解析器。

### 2. 两级按需加载而非一次读取全部任务

项目总览只调用 `list --json`，返回每个 change 的计数与更新时间；用户选中 change 后才调用 `status` 和 `instructions apply`。后端为相同项目与 change 提供短时、可丢弃缓存，并在响应中返回 `snapshotAt` 和 `freshness`。

这一方式避免工作区项目和 change 较多时形成命令风暴。刷新单个 change 只失效其详情，不强制重载其它项目。

### 3. OpenSpec 与 Runtime 分层决定状态

任务基础事实只有 `done` 与未完成。完整看板状态按以下优先级归一化：

1. OpenSpec `done=true` 映射为 `DONE`。
2. 可信 Runtime 显式记录阻塞、冲突、漂移或等待决策时映射为 `BLOCKED`。
3. Runtime 当前任务与该 task 匹配时，按执行阶段映射为 `IN_PROGRESS` 或 `IN_REVIEW`。
4. 其余未完成任务映射为 `TODO`。

没有 Runtime 证据时，界面只展示可证明的待执行、已完成和需关注状态，不根据最近修改时间、任务顺序或聊天文本猜测。Runtime 融合通过独立 provider 接口完成，使只读 MVP 不依赖 `session-autopilot` 尚未实现的持久状态。

### 4. 建立独立前端 feature

新增 `frontend/src/features/openspec-board/`，由 FeatureManifest 自动注册菜单和路由。页面可复用现有工作台的布局经验与公共 UI primitives，但不得 import `delivery-center` 的内部组件、hooks 或 API。

桌面端使用三段工作台：项目/需求导航、任务看板、详情检查器。项目总览先展示 change 卡片；进入 change 后展示状态列。窄屏使用项目选择器、状态分段筛选和单列任务 disclosure，避免强制横向拖动五列。

视觉采用中性背景、1px 边框、克制圆角和紧凑信息密度。卡片只用于可选择的 change/task 实体，不为普通说明和状态提示叠加容器。

### 5. 第一阶段保持只读

第一阶段支持刷新、搜索、筛选、打开 artifact 和进入关联会话，不提供拖卡改状态。未来若支持写操作，必须转换为受控业务命令：启动任务绑定 Runtime；完成任务先取得实现与验证证据；归档必须走 OpenSpec archive 协议。视觉拖动不能直接编辑复选框。

### 6. API 按项目总览与需求详情拆分

计划新增两个只读契约：

- `GET /api/claude-chat/openspec/boards`：返回允许范围内项目及活动 change 摘要、聚合计数、项目级错误和快照时间。
- `GET /api/claude-chat/openspec/boards/{projectId}/changes/{changeId}`：返回 artifact 路径、结构化任务、状态投影、Runtime 摘要和新鲜度。

项目标识由服务端生成并映射到允许目录，前端不得提交任意绝对路径执行命令。错误响应不暴露未授权路径、完整命令输出或敏感运行证据。

## Risks / Trade-offs

- [OpenSpec CLI 版本或 JSON 字段变化] → 在适配器边界做版本探测、兼容解析和契约测试；未知结构返回可恢复的 `UNAVAILABLE`，不静默伪造数据。
- [大量项目触发命令风暴] → 总览和详情分级加载、限制并发、短时缓存并允许局部刷新。
- [活动列表不包含归档 change] → MVP 明确只展示活动 change；历史需求作为后续独立范围，不直接猜测 archive 目录。
- [Runtime 与 OpenSpec 状态短暂不一致] → OpenSpec `done` 保持完成事实优先；响应携带快照时间和运行证据新鲜度，漂移进入需关注状态。
- [artifact 路径泄露本地目录] → API 返回受控 artifact 引用或项目内相对路径，打开文件时再次校验项目根边界。
- [会话目录位于仓库子目录导致质量门禁误判不可用] → 仅回退到服务端绑定的 repository identity，并验证会话目录确实位于该仓库内；禁止无边界向上扫描。
- [复用交付中心导致领域耦合] → 仅复用公共 UI primitives 和布局原则，建立独立 feature 与 DTO。

## Migration Plan

1. 增加 CLI JSON 适配器和只读聚合服务，不改变现有初始化接口。
2. 增加只读 HTTP API、契约测试和目录边界测试。
3. 增加独立前端 feature，先接入活动 change 与基础两态任务。
4. 在 Runtime provider 可用后加入进行中、待验证和阻塞状态。
5. 完成类型检查、前后端测试、OpenSpec 严格校验和浏览器视觉验证后开放菜单。

回滚时移除前端 feature 注册入口和新增查询 API；现有 OpenSpec 初始化、PRD 交付中心和仓库内 artifacts 均不受影响。只读缓存可直接丢弃，无数据迁移。

## Open Questions

- 归档 change 是否需要进入首版“历史需求”范围；当前方案默认不进入。
- artifact 点击后复用本地文档查看器还是系统编辑器；实现前根据现有公开能力选择，不扩大首版范围。
- 首版是否立即接入 `session-autopilot` 运行证据；若其接口尚未稳定，则按基础状态先交付。
