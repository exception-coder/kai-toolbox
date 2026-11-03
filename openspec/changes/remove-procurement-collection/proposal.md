## Why

用户明确要求移除已无使用价值的“招采信息采集”，减少无用入口和维护成本。

## What Changes

- **BREAKING** 移除招采前端页面、路由、菜单、后端 API、Maven 模块及依赖。
- 移除招采专属浏览器采集、发现和种子导入脚本，以及内置招采模型配置。
- 重新生成菜单权限目录和启动导航数据；保留历史数据库、私有配置和原有实施记录。

## Capabilities

### New Capabilities

- `procurement-retirement`: 招采功能退出产品与构建。

### Modified Capabilities

无。

## Impact

影响前端功能目录、父 POM、宿主依赖、共享 LLM 配置中的招采专属条目。不移除共享浏览器服务或 LLM 网关，不执行数据库清理，不重启服务。此退役不改变 AI 编程架构的组件职责、上下文和验证交付契约。
