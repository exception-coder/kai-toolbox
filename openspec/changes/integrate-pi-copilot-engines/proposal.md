## Why

Vibe Coding 需要在既有多引擎体系中提供 Pi 与 GitHub Copilot，支持用户选择模型服务而不污染本机其他引擎配置。

## What Changes

- 新增独立的 Pi、Copilot 引擎身份与原生协议适配器。
- 接入模型目录、服务商凭据、流式文本及工具反馈、恢复和中断。
- 依赖、认证、权限或执行失败明确报告，不回退到其他引擎或伪造成功。
- 复用现有会话配置和本地服务商档案，不增加数据库或导航。

## Capabilities

### New Capabilities

- `pi-copilot-engines`: Pi 与 Copilot 的可配置会话执行及隔离。

### Modified Capabilities

无。已有 Qwen、Trae 的活动变更目标不同，不复用其变更身份。

## Impact

Sidecar 引擎注册、独立适配器及依赖，Java 引擎身份校验，前端引擎选择和模型配置。证据来自现有 engineContract、builtinEngineAdapters、sessionManager 和官方 SDK 契约。无人工数据库变更，不自动登录、不修改用户全局配置、不自动重启。真实账号与运行验收在部署授权后执行。
