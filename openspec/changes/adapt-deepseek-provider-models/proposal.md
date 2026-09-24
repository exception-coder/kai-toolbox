## Why

Claude 第三方服务商档案默认将模型目录拼为 `/v1/models`，DeepSeek 官方模型目录却在根路径 `/models`。用户无法选择模型；对话中的 `401 Invalid token` 又被误以为是模型目录缺失。

## What Changes

- DeepSeek 官方地址的 Claude 对话路由到 `/anthropic`，模型目录路由到 `/models`；其他网关保持原路径。
- 模型目录缓存按地址及凭据隔离，认证失败给出明确恢复动作。
- 在既有服务商档案和新建会话表单中说明 DeepSeek 的配置与认证边界。

## Capabilities

### New Capabilities

- `deepseek-provider-compatibility`: DeepSeek 官方服务商的目录、对话路由及认证反馈。

### Modified Capabilities

- 无。

## Impact

受影响范围为 Vibe Coding 服务商模型代理、Claude Sidecar 会话环境和现有档案 UI。不新增服务、数据库表或人工 SQL；不改变其他服务商配置。
