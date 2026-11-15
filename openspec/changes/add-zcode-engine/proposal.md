## Why

VibeCoding 没有智谱/Z.ai ZCode 的引擎身份与原生执行适配。用户要求使用其 Harness，而非将 GLM 模型 API 冒充完整编码引擎。

## What Changes

- 在既有引擎目录与会话链路加入实验性 `zcode`。
- 通过官方 CLI 的 stream-json 执行、显式会话 ID 续接、文本和工具事件及终态转换。
- 使用显式原生权限模式；不支持的受限策略在启动前拒绝。
- 检测运行时后才允许选择；不声明未实现的模型目录、强度、速度、附件或后台子 Agent 能力。

## Capabilities

### New Capabilities

- `zcode-engine`: ZCode CLI discovery, execution, restoration and cancellation.

### Modified Capabilities

None.

## Impact

Node Sidecar 适配器与引擎目录、Java 引擎身份和准入、前端现有选择器与说明。无表结构、认证目录迁移、依赖升级或自动安装；Codex 执行代码不变。实际运行需安装原生 CLI、配置原生模型授权，并在获准加载新版本后验收。
