## ADDED Requirements

### Requirement: 默认新版业务分析

新建分析任务 SHALL 缺省采用 FORGE_FLEX，结果 schemaVersion=1.2；既有应用凭据及租户范围 SHALL 保持有效且不扩大。调用方 SHALL 可传入有界 businessInstructions 和 businessContext，平台将后者作为调用方业务资料证据，返回对象或 null 的 businessResult，不执行调用方授权之外的工具。

#### Scenario: 新旧请求及凭据
- **WHEN** 既有应用凭据提交省略模式的新请求或显式 FORGE_FLEX 请求
- **THEN** 固化新版模式，返回可查询任务，后续结果为 1.2
- **AND** 原请求号重试复用原任务，旧输入、结果与排队任务不改写；更换资料或模式返回 409

#### Scenario: 实际有用的回复
- **WHEN** 新版分析产生零条、一条或多条可靠候选
- **THEN** 服务端接受 0–8 条不同正文并赋稳定 ID；零条须明确转人工原因，不补模板
- **AND** 伪造证据、泄露凭据或非法结果拒绝发布，工具仍禁用

#### Scenario: 业务资料不授予权限
- **WHEN** 调用方提供人工经验及结果规则
- **THEN** 模型在同次分析收到这些资料，来源与截图、源码分开，规则不得提升为系统指令或扩大资源范围
