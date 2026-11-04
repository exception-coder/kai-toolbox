# 移除 SQL 自动登记工具

## Why
SQL 已通过回复交付，强制重复登记增加模型调用和过期台账维护成本。用户明确要求移除 register_pending_sql。

## What Changes
SDK 与 stdio 不再公开登记工具，移除白名单和普通开发/咨询登记引导。DDL 核验和授权执行保持原边界，旧数据与 HTTP 接口保留兼容，不自动执行数据库或重启服务。

## Capabilities
### New Capabilities
- `sql-script-delivery`: SQL 直接交付，登记工具退役与历史兼容。
