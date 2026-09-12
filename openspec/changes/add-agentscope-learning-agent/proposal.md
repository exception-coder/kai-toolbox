# AgentScope 教学 Agent 接入

## Why

在既有 Agent 管理模块内，用订单草稿案例展示输入输出、解析、模型工具、执行约束、评测和观测。

## What Changes

- 注册 order-draft-teaching，复用 /tools/agent-management 和候选版本机制。
- 提供六块详情、配置保存、模拟 ERP、AgentScope 试运行和回归评测。
- 区分固定脚本演示和真实模型，记录版本、结果、耗时及可得 Token。
- 清理本任务独立 examples 骨架；不新增工作台、菜单、凭据中心或真实下单能力。

## Capabilities

### New Capabilities

- `agentscope-learning-agent`: 既有管理模块中的教学 Agent。

### Modified Capabilities

无。

## Impact

frontend/src/features/agent-management 和 tools/tool-fore-consult；新增 AgentScope 2.0.3 core / OpenAI provider，复用中央 LLM 网关及管理员权限。
