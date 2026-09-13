## Why

用户要求彻底移除访客分析。仅隐藏菜单仍会加载后端模块、同步任务和 Python 服务，并保留可生效的专属配置。

## What Changes

- **BREAKING** 删除访客分析页面、架构入口、后端 API、Maven 模块及 Python 服务。
- 删除访客分析专属模型、同步和运行配置，刷新菜单权限目录。
- 清理本机持久化配置前备份，保留历史业务数据与其他模块共用的服务。

## Capabilities

### New Capabilities

- `visitor-analysis-retirement`: 访客分析退出构建、运行及配置入口。

### Modified Capabilities

无。

## Impact

影响前端功能注册、架构说明、父工程与 starter 依赖、runtime 服务目录及配置中心。AI 秘书、微信、共享模型网关和 Qdrant 继续使用原有实现。
