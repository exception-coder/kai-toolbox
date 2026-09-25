## Why

Forge 的服务商档案不是所有引擎都能安全消费。OpenCode 原生适配仅读取本机配置，切换引擎还可能携带不支持的网关状态。

## What Changes

- 为 OpenCode 增加独立子进程的会话级网关覆盖，不修改全局配置。
- 明确支持矩阵，阻止不支持的引擎静默忽略网关。
- Qwen、Trae、Antigravity 暂保留原生配置，未验证安全覆盖前不宣称支持。

## Impact

涉及服务商入口、Java 能力判定、Sidecar OpenCode 执行与模型目录。不变更数据库，不重启服务。
