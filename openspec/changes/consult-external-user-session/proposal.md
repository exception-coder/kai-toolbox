# 外部用户实施答疑会话

## Why
IM 接入目前逐次分析，无法以外部业务用户稳定续接 Codex 上下文，闲聊与问题补充也没有明确返回动作。

## What Changes
- 后端 SDK 可选 externalUserId，以认证 clientId、授权 tenantId、externalUserId 映射持久会话；省略时维持无状态合同。
- 固定开发者指令与用户资料分离；实施答疑标题后缀、消息处理动作与问题归属支持接入方日终整理。
- 复用受管任务幂等、原生 Codex thread/resume 和现有账号策略，禁止跨用户续接或失败时偷偷新建线程。

## Capabilities
- 新增 consult-external-user-session。
