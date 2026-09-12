# 教学 Agent 集成设计

## Context

用户明确要求复用既有 Agent 管理。AgentManagementPage、AgentManagementController 和 ConsultAgentManagementRepository 提供注册表及候选版本，consult_agent_definition / consult_agent_version 是已读 DDL 基线。Graphify 未覆盖这些符号，使用当前 HEAD 定向源码补齐。

## Goals / Non-Goals

目标为六块配置、真实 AgentScope 循环、确定性订单校验、模拟 ERP、版本关联回归和运行记录。非目标为独立页面、真实下单及新的凭据存储。

## Decisions

- 范围 M。教学详情放在现有 feature 子组件，保留其他 Agent 行为，复用全局 tokens 与既有排版。
- domain 定义订单和配置，service 编排，infrastructure 适配 AgentScope，repository 独占 SQL。
- 教学配置扩展表关联已有版本，事务保存候选配置。通用版本写接口拒绝教学 Agent，防止配置脱节。
- 只读工具生成结构化草稿，Java 验证数量和款号唯一性；不执行订单写入。
- 运行显式绑定已保存版本、模式、输入及可选上一份草稿。单实例并发 1，循环、模型重试、总时长及输出 Token 有上限。
- 演示使用固定场景脚本驱动真实 ReActAgent，不处理任意语言；真实模式通过统一 LlmGatewayProperties 配置调用模型。
- 回归逐样本执行并精确比较状态、款号、数量，结果绑定版本；禁止教学 Agent 生产发布，演示成绩不是生产证据。
- 无真实 usage 时 Token 为 null；错误不返回凭据或原始 SDK 请求内容。

## Risks / Trade-offs

文档 API 与发布字节码可能不同，针对 Maven 2.0.3 编译。依赖在真实 reactor 验证。超时失败不得保留成功草稿。样本仅为教学，不代表 ERP 规则。

## Verification / Rollback

验证幂等 SQLite DDL、配置版本、工具成功失败及边界、框架回归、前端检查和桌面移动端浏览器。执行 Forge all 与 OpenSpec strict。回滚撤销接入代码，保留本地数据。

## Sources

[官方发布](https://github.com/agentscope-ai/agentscope-java/releases/tag/v2.0.3) 与 [工具契约](https://java.agentscope.io/v2/en/docs/building-blocks/tool)。
