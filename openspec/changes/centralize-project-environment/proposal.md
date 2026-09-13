## Why

用户希望在项目库集中管理研发环境，避免项目与 Forge 环境入口分散。

## What Changes

- 项目库增加全局环境入口，嵌入既有 Forge 环境能力。
- 项目环境说明项目画像与全局工具的作用范围，并连接全局环境。
- 独立菜单隐藏，旧链接跳转，保留原环境权限。

## Capabilities

### New Capabilities

- `project-environment-entry`: 集中环境入口和范围说明。

### Modified Capabilities

## Impact

仅前端入口、公开组件接口与菜单目录。复用环境 API，不新增配置存储或数据库变更。版本继承、项目覆盖及精确影响分析尚无现有模型，本切片不声称已实现。
