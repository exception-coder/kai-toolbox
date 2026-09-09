## Context

`PrdProgressEvaluationService` 当前同时承担资料装配、Prompt 编排、模型调用、结果校验与保存；`progress-evaluation/v2-system.md` 又把开发文档任务清单放在首要位置。源码证据虽经 `DeliveryClaimLedgerService` 验证，但计划边界并非 OpenSpec。另一方面，`AgentManagementController`、Service、Repository 和前端均固定为 `business-consult`，无法登记第二个 Agent。

Graphify 查询已定位上述调用链，最终行为再由相应源码和测试核对。工作区存在其他任务的未提交修改，本变更不接触 `tool-projects` 与 `add-graphify-incremental-sync`。

## Goals / Non-Goals

**Goals:**

- 将进度推理抽成稳定身份、版本和结构化契约的 Agent。
- 确立 OpenSpec tasks > 已验证源码/测试/Git > PRD/开发文档的证据顺序。
- 将 Agent 管理泛化为多 Agent 注册表，并登记需求进度分析 Agent。
- 保留既有进度分析入口和已验证 claim ledger。

**Non-Goals:**

- 不让 LLM 直接修改 OpenSpec 状态。
- 不以 Graphify 新鲜度代替源码、测试或运行时验证。
- 不在本变更引入独立队列、调度器或新的数据库产品。

## Decisions

1. 在 `tool-prd-clarify` 内新增聚焦的 `RequirementProgressAnalysisAgent`，原服务保留为用例编排与持久化边界。Agent 固定 `agentId`、编排版本、Prompt 引用、能力约束和输出校验，避免继续扩张单一服务。
2. 通过本地项目中精确的 OpenSpec change 标识读取 `tasks.md`；仅在绑定唯一明确时作为权威分母。无明确绑定时仍检查代码，但输出降级状态，不伪造权威完成率。首版使用分析请求中的显式 change 标识，避免名称相似度猜测。
3. Graphify 用于定位候选文件与调用路径，`source_read`、测试和 Git/质量结果用于证明；服务端继续验证路径、行号与内容哈希，模型文本本身不构成通过证据。
4. 将现有 Agent Repository 改为按 `agentId` 参数化，新增注册表列表与动态 Agent 路由；沿用现有表，按应用启动幂等初始化需求进度 Agent，避免跨模块直接访问他方业务表。
5. Agent 管理中的需求进度条目用于身份、能力、版本和回归数据治理；实际运行编排版本由代码常量和 Prompt 引用保持同源，发布配置不能绕过运行端白名单。

## Risks / Trade-offs

- [OpenSpec 尚未绑定] → 明确展示降级模式，并要求用户选择/传入 change，不以猜测补齐。
- [注册配置与运行实现漂移] → 登记稳定代码引用与编排版本，增加契约测试校验默认生产版本。
- [通用化 API 影响原页面] → 保留原业务咨询路径作为兼容别名，新增列表和动态路径，前端逐步迁移。
- [Graphify 图谱过期] → 只将其作为导航，所有完成 claim 必须落到当前源码或测试证据。

## Migration Plan

1. 幂等插入需求进度 Agent 定义和默认生产版本。
2. 发布通用 Agent Registry API，同时保留旧 API。
3. 上线 Agent 抽象与 OpenSpec 上下文装配；旧请求无 change 标识时按降级路径运行。
4. 通过后端单测、前端 typecheck/build 和 Forge quality gate 验证；回滚时可恢复旧调用服务，新增注册数据不影响业务咨询。

## Open Questions

- 后续是否把 OpenSpec change 绑定持久化到需求记录，而非每次分析请求携带；本次先保持兼容并建立契约。
