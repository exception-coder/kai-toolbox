## Why

已登记项目与模块工作区重复选择项目，导致初始化、代码模块和会话上下文分散。用户确认统一为项目库中的 AI 工作区。

## What Changes

- 项目库保留单一项目列表，本地发现收进添加项目流程。
- 项目详情默认进入 AI 工作区，复用当前项目目录管理模块和会话。
- 已登记但未初始化的项目仍可开始工作，系统画像继续明确显示就绪状态。
- 兼容旧模块工作区链接，按已有项目身份恢复，不创建重复项目。
- 统一默认项目目录和工作区目录为一份项目目录配置，扫描及本地操作共用根范围，首次保存原子地切换旧配置来源。

## Capabilities

### New Capabilities

- `unified-project-ai-workspace`: 一个项目身份下的画像、模块及会话入口。

### Modified Capabilities

无。

## Impact

修改 project-workspace 的列表、详情、模块页和目录编辑，新增项目工作区组件及 common 目录来源接口。AI 工作区解析器、项目扫描、缓存与本地操作共用目录源。复用现有 registry、动态配置和会话 API，不迁移数据库或改写会话 ID。并行的 OpenSpec 集中管理和 Graphify 变更不纳入本次提交。

## Evidence and Scope

Graphify 定位后以当前源码补齐事实：ProjectRegistryPage 维护全局模块区域，ProjectWorkspacePage 又维护目录选择。现有主规格无对应统一工作区能力；目录管理变更只集中配置，不解决项目身份重复。本次不重构任务生命周期、Graphify 或外部服务。
