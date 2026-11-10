## ADDED Requirements

### Requirement: Stable requirement progress agent contract
系统 SHALL 以稳定 Agent 标识、编排版本、能力白名单、结构化输入输出和确定性结果校验执行需求进度分析，而不是由调用方拼接一段无版本 Prompt。

#### Scenario: Run a progress analysis
- **WHEN** 用户对需求发起本地代码进度分析
- **THEN** 系统通过需求进度分析 Agent 执行并记录 Agent 标识、编排版本和运行证据

### Requirement: OpenSpec is the authoritative plan boundary
系统 MUST 在存在明确 OpenSpec change 绑定时，以其 tasks 作为完成项分母和任务身份来源；不得通过标题相似度猜测绑定。

#### Scenario: Explicit OpenSpec change is available
- **WHEN** 分析请求明确绑定项目内存在的 OpenSpec change
- **THEN** Agent 将该 change 的 tasks 作为计划基线，并要求每个完成结论映射到任务标识

#### Scenario: OpenSpec change is not explicitly bound
- **WHEN** 分析没有唯一且明确的 OpenSpec change 标识
- **THEN** 系统仍可输出源码核查结果，但 MUST 标记为非权威降级分析且不得伪装为 OpenSpec 完成率

### Requirement: Evidence hierarchy and verification
Agent SHALL 按 OpenSpec 计划、Graphify/URL 路由导航、当前源码与测试、Git/质量结果、辅助文档的顺序取证；完成结论 MUST 由服务端可验证证据支持。

#### Scenario: Model claims completion without valid source evidence
- **WHEN** 模型输出完成 claim 但文件、行号或内容哈希无法由服务端验证
- **THEN** 系统将该 claim 降级且不计入已验证完成项

#### Scenario: Graphify locates a code path
- **WHEN** Graphify 返回候选节点或调用路径
- **THEN** Agent 继续读取当前文件或测试进行核验，而不是仅凭图谱节点宣布完成

### Requirement: Regression-ready agent definition
需求进度分析 Agent SHALL 提供可登记的能力清单、Prompt 引用、编排版本和回归样例集。

#### Scenario: Agent is inspected in governance
- **WHEN** 管理员在 Agent 管理中选择需求进度分析 Agent
- **THEN** 系统显示其生产版本、候选版本、证据能力和回归样例
