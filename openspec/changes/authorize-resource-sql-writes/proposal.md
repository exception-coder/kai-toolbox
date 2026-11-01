## 目标

普通 Vibe Coding 在用户明确授权当前数据库写操作后，可以直接执行，不再被统一的“只登记”指令阻断。默认查询、业务咨询和计划评审保持只读。

## 范围

在既有 `execute_resource` 增加 `EXECUTE`，复用资源绑定、非生产环境校验、SQL 连接器及操作历史。同步两种 MCP 装配、Agent 指令和架构说明。不开放生产，不改手动控制台，不新增工具或独立审批系统。

新增能力：`authorized-resource-sql-writes`。
