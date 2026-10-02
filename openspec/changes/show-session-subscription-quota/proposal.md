# 当前会话订阅额度

## Why
现有用量页从默认目录扫描全局 rollout，不能代表当前会话订阅账号，已用比例也不符合用户需要的剩余额度口径。

## What Changes
- 在既有用量页顶部按已登记引擎和已加载会话账号来源汇总真实剩余额度，当前账号优先，多账号分别显示。
- Codex 与 Claude 使用已核验的真实额度来源，其余缺接口的引擎明确不可用。
- 账号从有权访问的会话持久化 codexHome 选择，API/第三方/不可用不估算。
- 本地 Token 与固定价格参照独立展示。

## Capabilities
### New Capabilities
- `session-subscription-quota`: 会话账号真实配额与诚实不可用状态。

## Impact
影响 claude-chat 用量 UI、Java 只读接口与 Sidecar App Server 适配；不改数据库、不重启服务、不发布共享 SDK。
