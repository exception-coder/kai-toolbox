## Context

当前 DomainExplorationService 通过 Graphify、只读 Agent 和 DomainResultValidator 获取有效源码引用，DomainSnapshotStore 原子保存 `.forge/domains/snapshot.json`。KnowledgeGraphCard 却用目录登记状态展示知识成熟度。knowledgeMcp 的两个别名实际复用同一 Markdown 引擎。

本变更为完整档：涉及跨项目编排、模型输出验证及持久化状态；采用现有注册系统身份，未新增配置数据库。工作区存在其他任务的暂存改动，实施避开其项目父页面及测试文件。

## Goals / Non-Goals

统一入口、证据获取与知识查询，允许 2–4 个已登记且路径不同的项目开展关系探索。保留原领域 API、知识库内容及评审规则；不自动确认业务含义，不将静态证据称为真实调用或数据库事实，不物理合并知识仓库。

## Decisions

### 取证与关系归纳

抽取 DomainExplorationService 的单项目取证步骤为可复用方法，返回已校验结果而不发布领域快照。TopologyExplorationService 在每个项目的 cwd 下分别调用，再使用 disabled 工具策略归纳跨项目候选关系。输出只允许引用提供的项目、领域和证据序号；每条关系必须包含两端项目证据。源码与图谱指纹在整轮前后核对；选中项目的身份和路径变化也使结果过期。拓扑无法证明实际运行调用，所有关系为待核实候选。

复用原安全文件存储实现，以固定 topology 命名空间保存独立 snapshot/run/lock，避免覆盖 `.forge/domains`。锁冲突返回 409，服务中断将无锁 RUNNING 标记 FAILED；失败保留上一版。限制输入项目数、范围、模型输出、关系数、引用数量及持久化体积。空关系作为有缺口的探索结果呈现。

### UI 与兼容

SystemDomainsPanel 保留导出名，内部统一业务知识和跨项目关系视图，领域主体复用。项目详情标签改为“知识探索”，旧 `tab=domains` 链接兼容。KnowledgeGraphCard 保留 Graphify 操作，移除按六类／四类目录补齐的初始化流程，关联注册身份后复用统一面板。未登记项目提供接入项目库路径，不隐式建档。使用 quiet-luxury-ui 的分隔线与段落层级，避免卡片嵌套。

知识快照展示未探索、有候选、证据过期；运行状态独立为 RUNNING→COMPLETED/FAILED。无候选的已完成结果显示未发现关系及 gaps。不提供凭空的“已确认”按钮或根据文件数量显示已确认；已确认知识保留原知识引擎评审约束，统一查询原样返回来源和内容。

### MCP 查询

现有 consult-readonly 增加 knowledge_query，参数 source=domain/topology/all、action、arguments。只读白名单由 knowledgeMcp 共享，拒绝 reload 与写入。返回分来源状态，单库失败保留另一库结果；超时和输出上限有界。领域候选及评审查询只作用于 domain，保留原 engine 的 revision 校验和继承。旧 domain-knowledge/cross-topology 名称兼容，默认指引优先统一工具。

### 消费者影响

新增拓扑 Controller、Service、Model、Validator；存储复用和领域取证抽取不改变原 DTO。前端知识卡片及领域面板消费新接口；只读 MCP 工具列表、Codex enabled_tools、Claude 只读权限同步登记。旧登记 API 为兼容保留但不再作为新探索面板的可信度来源。

## Risks / Trade-offs

- 模型推断错误 → exact 引用校验、跨项目端点校验、候选标记，真实运行关系留待核实。
- 大项目成本 → 最多四项目、有限输出、两次校验尝试；不重复扫描活跃轮询。
- 并行源码修改 → 全轮指纹校验失败保留旧快照；读取时显式过期。
- 已有知识仓库离线 → 分来源可恢复错误，不把不可读当作无知识。

## Migration Plan

无数据迁移；原快照与知识库原位保留。回退本次代码即可恢复旧入口，新 `.forge/topology` 数据无需删除。验证覆盖成功、非法引用、变化拒绝发布、锁与失败保留、MCP 白名单及部分失败、UI 状态与项目切换。构建受影响模块与宿主，执行质量门禁、浏览器验收及至少 60 秒运行稳定观察，再局部提交。

## Open Questions

无阻塞决策。Agent 自审：保持只读边界与既有知识权威；完整业务确认工作流继续由原知识引擎管理。
