# 咨询知识随项目维护

## Why
集中Domain Knowledge已退役，但咨询MCP、DDL及插件更新仍依赖旧仓库，可能读到过期或错误项目资料。

## What Changes
- 复用咨询源码授权路径读取项目docs/INDEX.md、docs/domain与规格，每次读取当前文件。
- cross-topology独立启动；停用集中Domain Knowledge注册及自动同步。
- DDL不读取旧知识继承或历史Markdown，使用目标项目SQL文件，歧义返回缺口。
- 同步提示词、路由诊断、规格及架构边界。

## Impact
Node咨询工具、Java项目证据/插件更新、需求分析资料预取、DDL核验及相关测试。无数据迁移、权限扩大或服务重启授权。
