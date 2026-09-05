## Context

Vibe Coding 在 `ChatPage.tsx` 中每 3 秒读取会话级 affected API 台账，并在顶部提供独立“涉及接口”页签；`SessionAffectedApisWorkspace.tsx` 负责展示接口与验证状态。与此同时，`OpenSpecBoardService` 已按已批准项目、活动 change、结构化 tasks 和可信 Runtime 证据构建只读 OpenSpec 看板，但 change 详情没有接口影响。

接口台账是 Agent Tool 写入的运行证据，不是设计权威。现有 `claude_chat_session_affected_api` 以会话为边界，`claude_chat_autopilot_run` 则持有会话、已校验项目根、change 和监督开始时间，可在不改数据库结构的前提下建立可信关联。

## Goals / Non-Goals

**Goals:**

- OpenSpec change 成为用户查看需求、任务、规格文件和接口影响的唯一聚合上下文。
- 只展示与当前项目根、change 和监督时间范围一致的接口证据。
- 保留接口登记与验证状态，且不把登记事实误报为通过。
- 删除聊天页的接口轮询和独立导航，减少无意义请求与重复信息架构。

**Non-Goals:**

- 不删除 Forge `register_affected_apis` Tool 或既有会话接口登记 HTTP 契约。
- 不从 Controller、OpenAPI 或 Markdown 再构建一份接口设计文档。
- 不用接口验证状态修改 OpenSpec task 完成状态。
- 不新增数据库迁移或历史数据回填。

## Decisions

### 1. 以监督绑定作为 change 关联边界

新增只读 `OpenSpecAffectedApiEvidenceService`。它按 `changeId` 查询监督运行，校验运行绑定的规范化项目根，仅接收 `updatedAt >= run.startedAt` 的会话接口记录。

选择这一方案而不是给接口表新增 `change_id`，因为当前登记 Tool 已天然运行在受约束会话中，监督运行已有所需关联信息；避免数据库迁移和 Tool 契约升级。代价是未绑定 OpenSpec 自动监督的历史接口登记不会出现在 change 看板，这是明确且安全的证据边界。

### 2. 看板投影只做证据聚合

`OpenSpecBoardView.ChangeDetail` 增加 `affectedApis` 只读集合。每项保留 method、path、change type、源码位置、说明、验证状态、验证方式、验证摘要、关联会话和更新时间。看板前端从该集合计算数量与发布就绪提示，不增加写操作。

选择 change 详情响应而不是新增一个 OpenSpec 接口端点，可保持一次快照内的任务、规格和接口影响一致，也减少额外前端请求。

### 3. 删除独立 UI，保留内部兼容契约

`ChatPage.tsx` 删除 affected API state、轮询、导航按钮和工作区分支；`SessionAffectedApisWorkspace.tsx` 删除。原会话 affected API API 客户端与服务端端点保留，供 Agent Tool、兼容调用和后续自动化使用。

OpenSpec 看板的 Inspector 增加“接口影响”章节；它使用分隔线、紧凑行和明确空状态，不创建新的卡片体系。桌面保持右侧检查器，窄屏随现有布局下沉。

## Risks / Trade-offs

- [风险] 同一会话先后绑定不同 change，旧接口记录可能混入新 change。→ 以当前监督运行的 `startedAt` 过滤记录，并以规范化项目根和 change 双重匹配。
- [风险] 同一接口由多个受监督会话登记，出现重复。→ 按 HTTP method + path 去重并保留更新时间最新的记录。
- [风险] 看板详情接口增加字段影响旧客户端。→ 仅做向后兼容的响应字段扩展，不删除原字段与端点。
- [风险] 未启用监督的会话接口记录不可见。→ 空状态明确说明需要绑定 OpenSpec 自动监督；不凭路径或自然语言猜测归属。
- [风险] 右侧检查器接口很多时变长。→ 使用限定高度的可滚动列表，保持任务看板主区域不被挤压。

## Migration Plan

1. 先扩展后端 OpenSpec change 投影并增加单元测试。
2. 再扩展 OpenSpec 看板前端类型和 Inspector 展示。
3. 最后移除 Vibe Coding 独立页签与轮询。
4. 运行前后端测试、构建、OpenSpec 严格校验和 Forge Quality Gate。

回滚时恢复聊天页签代码并撤销 change 详情的新增字段；底层接口台账未迁移，数据无需恢复。

## Open Questions

无。未绑定 OpenSpec 监督的历史记录按安全边界不自动归属，后续如需历史迁移应另开 change。
