## Why

Vibe Coding 尚未接入 NousResearch Hermes Agent。官方 ACP 已提供独立宿主所需的文本、工具、审批、恢复与取消能力。

## What Changes

- 复用既有 EngineAdapterRegistry、运行时目录与新建/切换会话入口。
- 实现官方 ACP JSONL 适配和无模型调用探活，隔离供应商消息与原生凭据。
- 增加精确恢复、单次批准及持久化未知轮次保护，避免后台任务误判停止或自动重放。

## Capabilities

### New Capabilities
- `hermes-engine`: 有界原生 Hermes ACP 实验适配。

### Modified Capabilities

None.

## Impact

Sidecar 引擎目录/适配器、Java 引擎身份与准入、前端统一入口和说明。无数据库或新服务。Codex 原生执行逻辑保持不变；安装、登录、服务加载与真实验收分别报告。
