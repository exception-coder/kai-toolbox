## Why

Vibe Coding 使用的 Codex SDK 0.150.1 的 model/list 不显示 GPT-6 Astra；同账号在 0.153.4 下可见。现有团队依赖面板只能检查版本和复制升级命令，管理员需要在应用内完成升级。

## What Changes

- 升级项目 Codex SDK 到已验证的 0.153.4。
- 在现有团队依赖面板提供内置 npm 引擎检查、单引擎升级及进度、失败与重试反馈。
- 复用版本目录与会话活动快照；隔离安装和验证，空闲时切换运行文件并重新连接，失败恢复旧文件。
- 仅管理员可以升级；固定包白名单，禁止提交任意命令、路径或版本字符串。
- 不自动升级外部 Antigravity 或预览版 DeepSeek，不改变账号模型权限。

## Capabilities

### New Capabilities

- `sidecar-sdk-upgrade`: 受控检查、升级和恢复 Sidecar 内置 SDK。

### Modified Capabilities

无。

## Impact

SidecarVersionService、SidecarProcessRegistry、SidecarClient、PluginPanel 和 sidecar 的 package.json/package-lock.json。增加管理员升级状态接口；无数据库迁移。既有未提交改动必须保留。依据为当前源码及同账号两版本 model/list 的实测结果；无待决业务选择。
