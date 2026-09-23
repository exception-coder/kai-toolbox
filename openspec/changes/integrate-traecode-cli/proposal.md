## Why

Vibe Coding 尚不能以独立引擎调用 TraeCode CLI。Trae 官方提供 CLI 2.0 的非交互 `exec --json` 与显式会话恢复，而非与 Codex SDK 同型的官方 Node SDK。

## What Changes

- 引入 `trae` 引擎身份和 CLI 2.0 JSONL 适配器，保留原生会话 ID、取消与可恢复错误。
- 引擎目录检测本机 CLI 版本；未安装或版本不符时禁止创建/切换，而非显示假就绪。
- Vibe Coding 复用既有引擎选择、权限、会话和工作目录；不新增数据库对象。

## Capabilities

### New Capabilities

- `traecode-cli-engine`: TraeCode CLI 2.0 的发现、会话执行与恢复边界。

## Impact

Sidecar、Java 会话准入、前端引擎目录及 AI 编程架构说明。当前环境无 `traecli`，运行协议与账号验收保留待办。
