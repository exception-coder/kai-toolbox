## ADDED Requirements

### Requirement: Single management workspace

系统 SHALL 仅注册一个 Agent 管理菜单，并在同一工作台提供 Agent 列表与评测中心，保留独立能力评测。

#### Scenario: Switch management views
- **WHEN** 用户在 Agent 管理切换到评测中心再返回
- **THEN** 页面标题及入口保持统一，现有 Agent 草稿保留，全部评测功能可访问

### Requirement: Compatible evaluation navigation

系统 SHALL 将旧评测地址重定向到 Agent 管理的评测视图，保留查询参数与 hash；视图、Agent、题集和报告选择 MUST 支持刷新及浏览器历史。

#### Scenario: Follow old evaluation link
- **WHEN** 用户访问 `/tools/eval?dataset=example#results`
- **THEN** 地址替换为 `/tools/agent-management?dataset=example&section=evaluation#results`，不产生返回循环

#### Scenario: Evaluate from an agent
- **WHEN** 用户从 Agent 的评测详情打开评测中心
- **THEN** 显示来源 Agent、预选其快照题集，并提供返回该 Agent 及查看全部评测的操作

#### Scenario: Change dataset
- **WHEN** 用户更换数据集
- **THEN** 旧运行和对比选择清除，刷新后保留新的数据集选择

### Requirement: Explicit evaluation availability

系统 MUST 对加载失败、题集缺失和执行器不匹配显示恢复动作，不能用其他题集或 Agent 静默替代；通用评测 SHALL 不被宣称为候选版本发布证明。

#### Scenario: Dataset or adapter unavailable
- **WHEN** 关联题集不存在、无启用用例或没有匹配执行器
- **THEN** 开始评测不可用，并提示检查样本来源或返回全部评测

#### Scenario: Evaluation API unavailable
- **WHEN** 评测目录或运行列表加载失败
- **THEN** 用户可见失败信息和重试操作，Agent 管理导航仍可用

#### Scenario: Generic result versus release evidence
- **WHEN** 用户从 Agent 进入通用评测
- **THEN** 界面说明运行尚不验证候选完整配置，不自动修改其发布结论
