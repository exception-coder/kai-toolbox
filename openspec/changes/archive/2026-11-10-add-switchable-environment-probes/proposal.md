## Why

环境管理串行启动 11 条版本命令，并等待套件、仓库全部完成才展示。用户要求优化速度，并提供 Go 实现供逐步迁移和同机对比。

## What Changes

- 提取本机探测引擎端口，提供有限并发 Java 与独立 Go 模块实现。
- 保持共享版本判定、套件和仓库规则；默认 Java，选择 Go 后不得静默回退。
- 增加整体、引擎及逐命令耗时；界面支持切换、无结果缓存的顺序对比和失败恢复。
- PATH 短期缓存并在显式刷新及安装复检时更新，避免常规重复启动 PowerShell。

## Capabilities

### New Capabilities

- `switchable-environment-probes`: 可替换探测引擎、统一结果与公平耗时对比。

### Modified Capabilities

无。

## Impact

影响 tool-claude-chat 的环境服务、命令执行器与 HTTP 入口，frontend 的 forge-environment，以及新增 go/environment-probe 模块。无数据库变更；既有安装操作继续由 Java 管理。Go 按需子进程运行，不新增监听端口。证据来自当前源码和既有测试，Graphify 查询未精确覆盖此功能，已定向读取补齐。无待决业务选择。
