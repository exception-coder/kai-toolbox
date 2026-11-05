# 默认使用新版业务分析合同

## Why

调用方已能换取应用票据，但旧服务拒绝业务规则、人工资料和 FORGE_FLEX。新任务应直接采用新版，不再要求调用方配置固定三条回复模式。

## What Changes

新任务缺省使用 FORGE_FLEX，结果 1.2 支持 0–8 条实际有用的回复、业务资料证据和调用方定义的 businessResult。沿用既有凭据与任务体系，不扩展工具权限；保留旧任务阅读、原请求号恢复及显式旧模式。

## Capabilities

### Modified Capabilities

- `consult-backend-analysis`: 新任务默认合同及调用方业务资料。
